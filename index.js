const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// MiddleWare
app.use(cors());
app.use(express.json());
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5p7yt.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function run() {
    try {
        await client.connect();
        const database = client.db('graphiXshop');
        const productsCollection = database.collection('products');

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