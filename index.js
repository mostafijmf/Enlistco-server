const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
const nodemailer = require('nodemailer');
const mg = require('nodemailer-mailgun-transport');


// Middleware 
app.use(cors());
app.use(express.json());



// -------MongoDB------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3acffrh.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



// -------Verify JWT------
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
};

// -----------Email sender-----------
const auth = {
    auth: {
        api_key: '88ab8c8d96a1ebd88315e4587d2806d1-787e6567-d5a0e114',
        domain: 'sandbox7d656ef61d664d06846c8cb6c6e39027.mailgun.org'
    }
}
const nodemailerMailgun = nodemailer.createTransport(mg(auth));


async function run() {
    try {
        await client.connect();
        const usersCollection = client.db("JobPortal").collection("usersData");
        const employersCollection = client.db("JobPortal").collection("jobPost");
        const applyCollection = client.db("JobPortal").collection("applyJob");

        // Users
        app.put('/users/:email', async (req, res) => {
            const user = req.body;
            const email = req.params.email;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const update = await usersCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, { expiresIn: '1y' })
            res.send({ update, token });
        });

        // update seeker personal data
        app.patch('/users/:id', async (req, res) => {
            const id = req.params.id;
            const user = req.body;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    phone: user.phone,
                    address: user.address,
                    state: user.state,
                    country: user.country,
                    zip: user.zip
                }
            };
            console.log(user, id);
            const update = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(update);
        });

        app.get('/users', async (req, res) => {
            const query = {};
            const cursor = usersCollection.find(query);
            const allUser = await cursor.toArray();
            res.send(allUser);
        });

        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const cursor = usersCollection.find(query);
            const userInfo = await cursor.toArray();
            res.send(userInfo);
        });

        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result)
        });

        // ---------Admin data--------- 
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            const isAdmin = user?.admin === true;
            res.send({ admin: isAdmin })
        })


        // ---------Seekers Data--------- 
        app.put('/seeker/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const uc = user.userContact ? user.userContact : '';
            const uj = user.jobExp ? user.jobExp : '';
            const ue = user.education;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    firstName: uc.firstName ? uc.firstName : '',
                    lastName: uc.lastName ? uc.lastName : '',
                    phone: uc.phone ? uc.phone : '',
                    country: uc.country ? uc.country : '',
                    address: uc.address ? uc.address : '',
                    state: uc.state ? uc.state : '',
                    zip: uc.zip ? uc.zip : '',
                    exJobTitle: uj.exJobTitle ? uj.exJobTitle : '',
                    exCompany: uj.exCompany ? uj.exCompany : '',
                    exStartDate: uj.exStartDate ? uj.exStartDate : '',
                    exEndDate: uj.exEndDate ? uj.exEndDate : '',
                    exWorking: uj.exWorking ? uj.exWorking : '',
                    exResponsibilities: uj.exResponsibilities ? uj.exResponsibilities : '',
                    degree: ue.degree,
                    institution: ue.institution,
                    edugroup: ue.edugroup,
                    eduStartDate: ue.eduStartDate,
                    eduEndDate: ue.eduEndDate,
                    eduStudying: ue.eduStudying,
                    resume: ue.resume
                }
            };
            const update = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(update);
        });

        // ---------Employer job post--------- 
        app.post('/post', async (req, res) => {
            const user = req.body;
            const po = user.postOptions;
            const ec = user.employerContact;
            const jobData = {
                jobTitle: ec.jobTitle,
                company: ec.company,
                workplace: ec.workplace,
                jobLocation: ec.jobLocation,
                empQuantity: ec.empQuantity,
                empType: ec.empType,
                jobDescription: user.jobDescription,
                employerEmail: user.email,
                receiveEmail: po.receiveEmail,
                salary: po.salary,
                skillTags: po.skillTags,
            };
            const result = await employersCollection.insertOne(jobData);
            res.send(result);
        });

        // Get post
        app.get('/post', async (req, res) => {
            const query = {};
            const cursor = employersCollection.find(query);
            const allPost = await cursor.toArray();
            res.send(allPost);
        });

        app.get('/post/:email', async (req, res) => {
            const email = req.params.email;
            const query = { employerEmail: email };
            const cursor = employersCollection.find(query);
            const post = await cursor.toArray();
            res.send(post);
        });

        app.put('/post/:id', async (req, res) => {
            const id = req.params.id;
            const user = req.body;
            const options = { upsert: true };
            const query = { _id: ObjectId(id) };
            const updateDoc = {
                $set: user
            };
            const update = await employersCollection.updateOne(query, updateDoc, options);
            console.log(update)
            res.send(update)
        });
        app.delete('/post/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await employersCollection.deleteOne(query);
            res.send(result)
        });

        // ---------Seeker apply job--------- 
        app.post('/apply', async (req, res) => {
            const user = req.body;
            // console.log(user)
            // nodemailerMailgun.sendMail({
            //     from: 'myemail@example.com',
            //     to: 'mostafijmozumdar@gmail.com',
            //     subject: 'Hey you, awesome!',
            //     // html: '<b>Wow Big powerful letters</b>',
            //     text: 'Mailgun rocks, pow pow!'
            //   }, (err, info) => {
            //     if (err) {
            //       console.log(err);
            //     }
            //     else {
            //       console.log(info);
            //     }
            //   });
            const result = await applyCollection.insertOne(user);
            res.send(result);
        });

        app.get('/apply/:email', async (req, res) => {
            const email = req.params.email;
            const query = { seekerEmail: email };
            const cursor = applyCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });
    }
    finally { }
};
run().catch(console.dir);


// server test
// app.get('/', (req, res) => {
//     res.send('hello')
// });

app.listen(port, () => { })