const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const ObjectId = require("mongodb").ObjectId;
require("dotenv").config();
const admin = require("firebase-admin");
const fileupload = require("express-fileupload");
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const app = express();
const port = process.env.PORT || 5000;
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

// MiddleWare
app.use(cors());
app.use(express.json());
app.use(fileupload());

const uri = `mongodb://localhost:27017/CarBuySell`;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const SSLCommerzPayment = require("sslcommerz-lts");
const store_id = process.env.SSLCOMMERZ_STORE_ID;
const store_passwd = process.env.SSLCOMMERZ_STORE_PASSWORD;
const is_live = false; //true for live, false for sandbox

const verifyToken = async (req, res, next) => {
    if (req.headers?.authorization?.startsWith("Bearer ")) {
        const token = req.headers?.authorization.split(" ")[1];
        try {
            const decodeUser = await admin.auth().verifyIdToken(token);
            req.decodeEmail = decodeUser.email;
        } catch { }
    }
    next();
};

async function run() {
    try {
        await client.connect();
        const database = client.db("CarBuySell");
        const productsCollection = database.collection("products");
        const reviewsCollection = database.collection("reviews");
        const orderCollection = database.collection("orders");
        const usersCollection = database.collection("users");

        // get specific order
        app.get("/orders", verifyToken, async (req, res) => {
            const email = req.query.email;
            // const requester = req?.decodeEmail;
            if (email) {
                const query = { email: email };
                const cursor = orderCollection.find(query);
                const result = await cursor.toArray();
                res.json(result);
            }
        });

        // get specific order
        app.get("/order/:id", async (req, res) => {
            const id = req.params.id;
            const query = { transactionId: id };
            try {
                const result = await orderCollection.findOne(query);
                return res.status(200).json(result);
            } catch (error) {
                return res.status(404).json({ message: "Order not found" });
            }
        });

        app.get("/allorders", async (req, res) => {
            const cursor = orderCollection.find({});
            const result = await cursor.toArray();
            res.json(result);
        });

        // get products with limit
        app.get("/limit_products", async (req, res) => {
            const limit = 6;
            const cursor = productsCollection.find({}).limit(limit);
            const result = await cursor.toArray();
            res.json(result);
        });

        // get All products
        app.get("/products", async (req, res) => {
            const cursor = productsCollection.find({});
            const result = await cursor.toArray();
            res.json(result);
        });

        // get All reviews
        app.get("/reviews", async (req, res) => {
            const cursor = reviewsCollection.find({});
            const result = await cursor.toArray();
            res.json(result);
        });

        // check admin
        app.get("/users/:email", async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await usersCollection.findOne(query);
            let isAdmin = false;
            if (result?.role === "admin") {
                isAdmin = true;
            }
            res.json({ admin: isAdmin });
        });

        // add new user
        app.post("/users", async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.json(result);
        });

        // Add orders
        app.post("/orders", async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.json(result);
        });

        // add product
        app.post("/products", async (req, res) => {
            const imgs = [];
            const images = req.files;

            for (const key in images) {
                const img = images[key];
                const imgData = img.data;
                const encodeImg = imgData.toString("base64");
                const imgBuffer = Buffer.from(encodeImg, "base64");
                imgs.push(imgBuffer);
            }
            const product = {
                name: req.body.name,
                model: req.body.model,
                mileage: req.body.mileage,
                fuelType: req.body.fuelType,
                registration: req.body.registration,
                seats: req.body.seats,
                interior: req.body.interior,
                brand: req.body.brand,
                color: req.body.color,
                condition: req.body.condition,
                rimSize: req.body.rimSize,
                price: req.body.price,
                imgs,
            };
            console.log(product);
            const result = await productsCollection.insertOne(product);
            res.json(result);
        });

        // add review
        app.post("/reviews", async (req, res) => {
            const review = req.body;
            const result = await reviewsCollection.insertOne(review);
            res.json(result);
        });

        // delete order
        app.delete("/orders/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.deleteOne(query);
            console.log("delete order", result);
            res.json(result);
        });

        // delete product
        app.delete("/products/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await productsCollection.deleteOne(query);
            res.json(result);
        });

        // update order status
        app.put("/order/status/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const findOrder = await orderCollection.findOne(filter);
            if (!findOrder) {
                return res.status(404).json({ message: "Order not found" });
            }
            const updateDoc = {
                $set: {
                    status: findOrder?.status === "pending" ? "shipped" : "pending",
                }
            };
            const result = await orderCollection.updateOne(filter, updateDoc);
            return res.status(201).json(result);
        });

        // make admin
        app.put("/users/admin", verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req?.decodeEmail;
            if (requester) {
                const query = { email: requester };
                const requesterAccount = await usersCollection.findOne(query);
                if (requesterAccount.role === "admin") {
                    const filter = { email: user.email };
                    const updateDoc = { $set: { role: "admin" } };
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result);
                }
            } else {
                res.status(403).json({ message: "You have no access" });
            }
        });

        app.post("/init-payment", async (req, res) => {
            const body = req.body;
            try {
                const findProduct = await productsCollection.findOne({
                    _id: new ObjectId(body.product._id),
                }, { projection: { imgs: 0 } });
                if (!findProduct) {
                    return res.status(404).json({ message: "Product not found" });
                }
                const tran_id = ObjectId().toString();
                const data = {
                    total_amount: findProduct?.price,
                    currency: "BDT",
                    tran_id: tran_id, // use unique tran_id for each api call
                    success_url: `${process.env.SERVER_SITE_URL}/payment-success/${tran_id}`,
                    fail_url: `${process.env.SERVER_SITE_URL}/explore`,
                    cancel_url: `${process.env.SERVER_SITE_URL}/explore`,
                    ipn_url: `${process.env.SERVER_SITE_URL}/explore`,
                    shipping_method: "Courier",
                    product_name: findProduct?.name,
                    product_category: "Car",
                    product_profile: "general",
                    cus_name: body?.userName,
                    cus_email: body?.email,
                    cus_add1: "Dhaka",
                    cus_add2: "Dhaka",
                    cus_city: "Dhaka",
                    cus_state: "Dhaka",
                    cus_postcode: "1205",
                    cus_country: "Bangladesh",
                    cus_phone: body?.phone,
                    cus_fax: "01711111111",
                    ship_name: "Customer Name",
                    ship_add1: "Dhaka",
                    ship_add2: "Dhaka",
                    ship_city: "Dhaka",
                    ship_state: "Dhaka",
                    ship_postcode: 1216,
                    ship_country: "Bangladesh",
                };
                const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
                sslcz.init(data).then((apiResponse) => {
                    let GatewayPageURL = apiResponse.GatewayPageURL;
                    res.send({ url: GatewayPageURL });
                    const newOrder = orderCollection.insertOne({
                        ...body,
                        product: findProduct,
                        transactionId: tran_id,
                        deliveryStatus: "pending",
                        paidStatus: false,
                    });
                });
            } catch (error) {
                return res.status(500).json({ message: "Internal server error" });
            }
        });

        app.post("/payment-success/:tran_id", async (req, res) => {
            const { tran_id } = req.params;
            const updateDoc = { $set: { paidStatus: true } };
            console.log(tran_id);
            try {
                const result = await orderCollection.updateOne({ transactionId: tran_id }, updateDoc);
                return res.redirect(`${process.env.CLIENT_SITE_URL}/success/payment/${tran_id}`);
            } catch (error) {
                return res.status(500).json({ message: "Internal server error" });
            }
        });
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("GraphiX Shop");
});

app.listen(port, () => {
    console.log("listing  port", port);
});
