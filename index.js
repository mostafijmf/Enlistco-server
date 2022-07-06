const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

// Middleware 
app.use(cors());
app.use(express.json());

// -------MongoDB------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3acffrh.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const usersCollection = client.db("JobPortal").collection("usersData");

        // User Data 
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const uc = user.userContact;
            const uj = user.jobExp;
            const ue = user.education;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    firstName: uc.firstName,
                    lastName: uc.lastName,
                    phone: uc.phone,
                    resume: uc.resume,
                    country: uc.country,
                    address: uc.address,
                    state: uc.state,
                    zip: uc.zip,
                    exJobTitle: uj.exJobTitle,
                    exCompany: uj.exCompany,
                    exStartDate: uj.exStartDate,
                    exEndDate: uj.exEndDate,
                    exWorking: uj.exWorking,
                    exResponsibilities: uj.exResponsibilities,
                    degree: ue.degree,
                    institution: ue.institution,
                    edugroup: ue.edugroup,
                    eduStartDate: ue.eduStartDate,
                    eduEndDate: ue.eduEndDate,
                    eduStudying: ue.eduStudying,
                }
            };
            const update = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(update);
        });

        app.get('/users', async (req, res) => {
            const query = {};
            const cursor = usersCollection.find(query);
            const allUser = await cursor.toArray();
            res.send(allUser)
        });

        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const cursor = usersCollection.find(query);
            const userInfo = await cursor.toArray();
            res.send(userInfo);
        });
    }
    finally { }
};
run().catch(console.dir);


// server test
app.get('/', (req, res) => {
    res.send('hello')
});

app.listen(port, () => { })