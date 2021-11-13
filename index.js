const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
require('dotenv').config();
const admin = require("firebase-admin");
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const app = express();
const port = process.env.PORT || 5000;
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// MiddleWare
app.use(cors());
app.use(express.json());
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5p7yt.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

const verifyToken = async (req, res, next) => {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers?.authorization.split(' ')[1];
        try {
            const decodeUser = await admin.auth().verifyIdToken(token);
            req.decodeEmail = decodeUser.email;
        } catch {

        }
    }
    next();
}


async function run() {
    try {
        await client.connect();
        const database = client.db('graphiXshop');
        const productsCollection = database.collection('products');
        const reviewsCollection = database.collection('reviews');
        const orderCollection = database.collection('orders');
        const usersCollection = database.collection('users');

        // get specific order
        app.get('/orders', verifyToken, async (req, res) => {
            const email = req.query.email;
            const requester = req?.decodeEmail;
            if (requester) {
                const query = { email: requester };
                const cursor = orderCollection.find(query);
                const result = await cursor.toArray();
                // console.log(result);
                res.json(result);
            }
        })

        // get products with limit
        app.get('/limit_products', async (req, res) => {
            const limit = 6;
            const cursor = productsCollection.find({}).limit(limit);
            const result = await cursor.toArray();
            res.json(result);
        })

        // get All products
        app.get('/products', async (req, res) => {
            const cursor = productsCollection.find({});
            const result = await cursor.toArray();
            res.json(result);
        })

        // get All reviews
        app.get('/reviews', async (req, res) => {
            const cursor = reviewsCollection.find({});
            const result = await cursor.toArray();
            res.json(result);
        })

        // check admin
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await usersCollection.findOne(query);
            let isAdmin = false;
            if (result?.role === 'admin') {
                isAdmin = true;
            }
            res.json({ admin: isAdmin });
        })

        // add new user
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.json(result);
        })

        // Add orders
        app.post('/orders', async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.json(result);
        })

        // add review
        app.post('/reviews', async (req, res) => {
            const review = req.body;
            const result = await reviewsCollection.insertOne(review);
            res.json(result);
        })

        // delete order
        app.delete('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.deleteOne(query);
            console.log('delete order', result);
            res.json(result);
        })

        // make admin
        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req?.decodeEmail;
            if (requester) {
                const query = { email: requester };
                const requesterAccount = await usersCollection.findOne(query);
                if (requesterAccount.role === 'admin') {
                    const filter = { email: user.email };
                    const updateDoc = { $set: { role: 'admin' } };
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result);
                }
            }
            else {
                res.status(403).json({ message: 'You have no access' });
            }
        })

    }
    finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send("GraphiX Shop");
})


app.listen(port, () => {
    console.log("listing  port", port);
})