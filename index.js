const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
const nodemailer = require('nodemailer');


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
function emailSender(data, letter) {
    const smtpTransport = nodemailer.createTransport({
        host: "mail.smtp2go.com",
        port: 2525, // 8025, 587 and 25 can also be used.
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    if (letter === 'coverLetter') {
        const { resume, subject, coverLetter, seekerEmail, seekerName, postID, receiveEmail, jobTitle } = data;
        smtpTransport.sendMail({
            from: {
                name: 'Job Portal',
                address: process.env.SENDER_EMAIL
            },
            to: receiveEmail,
            subject: subject,
            html: `<div style='background-color: #d9e7f5; padding: 40px 0;'><div style='width: 500px; margin: 0 auto; border-radius: 8px; background-color: white; padding: 30px;'><h2 style='text-align: center; margin: 0; font-size: 24px; color: #444;'>Job Portal</h2><h4 style='text-align: center; font-size: 20px; color: #444; font-weight: 400;'>You've received a cover letter from ${seekerName}</h4><hr/><div style='padding: 20px 0; color: #1abc9c;'><p style='margin: 0; font-size: 19px;'>Hi,</p><p style='margin: 0; font-size: 19px;'>${seekerName} wrote a cover letter to you in regards to ${jobTitle}</p></div><div style='background-color: #F1F5F9; padding: 20px; border-radius: 8px;'><p style='margin: 0; color: #7b7b7b; font-size: 18px;'>${coverLetter}</p></div><div style='width: 100%; text-align: center; margin-top: 20px;'><a href=${resume} style='padding: 8px 15px; border-radius: 5px; background-color: #1abc9c; text-decoration: none; color: white; font-size: 20px;'>See Resume</a></div><div style='width: 100%; text-align: center; margin-top: 30px;'><a href=${'https://job-portal-online.web.app/dashboard/seeker-applications'} style='padding: 8px 15px; border-radius: 5px; font-size: 20px;'>See seeker list</a></div></div></div>`
        }, function (error, response) {});
    }

    if (letter === 'offerLetter') {
        const { seekerEmail, seekerName, jobTitle, company, subject, offerLetter } = data;
        smtpTransport.sendMail({
            from: {
                name: 'Job Portal',
                address: process.env.SENDER_EMAIL
            },
            to: seekerEmail,
            subject: subject,
            html: `<div style='background-color: #d9e7f5; padding: 40px 0;'><div style='width: 500px; margin: 0 auto; border-radius: 8px; background-color: white; padding: 30px;'><h2 style='text-align: center; margin: 0; font-size: 24px; color: #444;'>Job Portal</h2><h4 style='text-align: center; font-size: 20px; color: #444; font-weight: 400;'>Great news, You've received an offer letter.</h4><hr /><div style='padding: 20px 0; color: #1abc9c;'><p style='margin: 0; font-size: 19px;'>Hi, ${seekerName}</p><p style='margin: 0; font-size: 19px;'>You've just received an offer letter from ${company} for the ${jobTitle} position.</p></div><div style='background-color: #F1F5F9; padding: 20px; border-radius: 8px;'><p style='margin: 0; color: #7b7b7b; font-size: 19px;'>${offerLetter}</p></div></div></div>`
        }, function (error, response) {});
    };
};



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
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, { expiresIn: '5y' })
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
            const update = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(update);
        });

        // Add seeker new education data
        app.put('/add-edu/:id', async (req, res) => {
            const id = req.params.id;
            const education = req.body;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $push: { education: education }
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        // Delete seeker education data
        app.patch('/delete-edu/:id', async (req, res) => {
            const id = req.params.id;
            const edu = req.body;
            const education = edu.edu;
            const filter = { _id: ObjectId(id) };
            const options = { multi: true };
            const updateDoc = {
                $pull: { education: education }
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        // Add seeker new Job experience data
        app.put('/add-jobexp/:id', async (req, res) => {
            const id = req.params.id;
            const jobExperience = req.body;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $push: { jobExperience: jobExperience }
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        // Delete seeker Job experience data
        app.patch('/delete-jobexp/:id', async (req, res) => {
            const id = req.params.id;
            const ex = req.body;
            const jobExperience = ex.ex;
            const filter = { _id: ObjectId(id) };
            const options = { multi: true };
            const updateDoc = {
                $pull: { jobExperience: jobExperience }
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        // Upload resume
        app.put('/user-resume/:id', async (req, res) => {
            const id = req.params.id;
            const resume = req.body;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: resume
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
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

        // ---------Admin data--------- 
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            const isAdmin = user?.admin === true;
            res.send({ admin: isAdmin })
        })

        app.delete('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query1 = { email: email };
            const query2 = { employerEmail: email };
            const query3 = { seekerEmail: email };
            const userResult = await usersCollection.deleteOne(query1);
            const epmResult = await employersCollection.deleteOne(query2);
            const appResult = await applyCollection.deleteOne(query3);
            res.send(userResult, epmResult, appResult)
        });


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
                    jobExperience: [{
                        exJobTitle: uj.exJobTitle ? uj.exJobTitle : '',
                        exCompany: uj.exCompany ? uj.exCompany : '',
                        exStartDate: uj.exStartDate ? uj.exStartDate : '',
                        exEndDate: uj.exEndDate ? uj.exEndDate : '',
                        exWorking: uj.exWorking ? uj.exWorking : '',
                        exResponsibilities: uj.exResponsibilities ? uj.exResponsibilities : '',
                    }],
                    education: [{
                        degree: ue.degree,
                        institution: ue.institution,
                        edugroup: ue.edugroup,
                        eduStartDate: ue.eduStartDate,
                        eduEndDate: ue.eduEndDate,
                        eduStudying: ue.eduStudying,
                    }],
                    resume: ue.resume,
                    seekerAbout: ue.seekerAbout ? ue.seekerAbout : ''
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
            const data = req.body;
            const result = await applyCollection.insertOne(data);
            emailSender(data, 'coverLetter');
            res.send(result);
        });

        app.put('/apply/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const query = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: { offerLetter: true }
            };
            const result = await applyCollection.updateOne(query, updateDoc, options);
            emailSender(data, 'offerLetter');
            res.send(result)
        });

        app.get('/apply/:email', async (req, res) => {
            const email = req.params.email;
            const query = { seekerEmail: email };
            const cursor = applyCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });
        app.get('/apply-emp/:email', async (req, res) => {
            const email = req.params.email;
            const query = { employerEmail: email };
            const cursor = applyCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });
    }
    finally { }
};
run().catch(console.dir);

app.listen(port, () => { })