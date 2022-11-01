const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 8800;
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { google } = require('googleapis');
const { OAuth2 } = google.auth;
const googleClient = new OAuth2(process.env.GOOGLE_CLIENT_ID);
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const emailSender = require('./controllers/emailSender');
const { accessAuth, activationAuth } = require('./middleware/authorize');


// ==================Middleware================== 
app.use(cors());
app.use(express.json());


// -------MongoDB------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gmbn38d.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const usersCollection = client.db("JobPortal").collection("usersData");
        const jobPostCollection = client.db("JobPortal").collection("jobPost");
        const applyJobCollection = client.db("JobPortal").collection("applyJob");
        const notificationCollection = client.db("JobPortal").collection("notifications");
        const paymentsCollection = client.db("JobPortal").collection("payment");


        // ========================Users Authentication========================
        app.post('/register', async (req, res) => {
            try {
                const { email, password } = req.body;
                const user = await usersCollection.findOne({ email });
                if (user) {
                    return res.status(400).json({ message: "This email already exists." })
                };

                const passwordHash = await bcrypt.hash(password, 12);
                const newUser = {
                    email,
                    password: passwordHash
                };
                const activation_token = jwt.sign(newUser, process.env.ACTIVATION_TOKEN_SECRET, { expiresIn: '5m' });
                const url = `${process.env.CLIENT_URL}/user/activate/${activation_token}`;
                emailSender({ email, url }, 'verify');
                res.send({ message: "Register success! Please verify your email." })
            } catch (error) {
                if (error) return res.status(500).send({ message: "Something went wrong!" })
            }
        });

        app.post('/email/activation', async (req, res) => {
            try {
                const { activation_token } = req.body;
                const activate = jwt.verify(activation_token, process.env.ACTIVATION_TOKEN_SECRET);
                const { email, password } = activate;

                const check = await usersCollection.findOne({ email });
                if (check) return res.status(400).send({ message: "This email already exists." });

                const user = {
                    email: email,
                    password: password,
                    newEntry: true
                };

                const result = await usersCollection.insertOne(user);
                if (result) res.send({ message: "Account has been activated!" })
            } catch (err) {
                if (err) return res.status(500).send({ message: "Activation link expired!" })
            }
        });

        app.post('/login', async (req, res) => {
            try {
                const { email, password } = req.body;
                const user = await usersCollection.findOne({ email });
                if (!user) return res.status(400).send({ message: "This email does not exist." });

                const isMatch = await bcrypt.compare(password, user.password)
                if (!isMatch) return res.status(400).send({ message: "Incorrect password!" });

                const user_token = jwt.sign({ email: user.email }, process.env.ACCESS_TOKEN_SECRET);

                res.send({
                    user_token: 'Bearer ' + user_token,
                    user,
                    message: 'Login success!'
                });
            } catch (err) {
                if (err) return res.status(500).send({ message: err.message })
            }
        });

        app.post('/forget-password', async (req, res) => {
            try {
                const { email } = req.body
                const user = await usersCollection.findOne({ email })
                if (!user) return res.status(400).send({ message: "This email does not exist." })

                const reset_token = jwt.sign({ email: user.email }, process.env.ACTIVATION_TOKEN_SECRET, { expiresIn: '5m' });

                const url = `${process.env.CLIENT_URL}/user/reset/${reset_token}`;
                emailSender({ email, url }, 'reset');
                res.send({ message: "Reset email sent successfully! Please check your email." })
            } catch (err) {
                return res.status(500).send({ message: err.message })
            }
        });

        app.patch('/reset-password', activationAuth, async (req, res) => {
            try {
                const { password } = req.body;
                const passwordHash = await bcrypt.hash(password, 12);
                const filter = { email: req.decoded.email };
                const options = { upsert: true };
                const updateDoc = {
                    $set: {
                        password: passwordHash
                    }
                };
                const update = await usersCollection.updateOne(filter, updateDoc, options);
                res.send({ update: update, message: "Password changed successfully!" })

            } catch (err) {
                return res.status(500).send({ message: err.message })
            }
        });

        app.post('/google_login', async (req, res) => {
            try {
                const { tokenId } = req.body;
                const verify = await googleClient.verifyIdToken({ idToken: tokenId, audience: process.env.GOOGLE_CLIENT_ID });
                const { email_verified, email } = verify.payload;

                const password = email + process.env.GOOGLE_CLIENT_SECRET;
                const passwordHash = await bcrypt.hash(password, 12);
                if (!email_verified) return res.status(400).send({ message: "Email verification failed!" });

                const userExist = await usersCollection.findOne({ email: email });
                if (userExist) {
                    const isMatch = await bcrypt.compare(password, userExist.password)
                    if (!isMatch) return res.status(400).send({ message: "Password incorrect!" })

                    const user_token = jwt.sign({ email: userExist.email }, process.env.ACCESS_TOKEN_SECRET);

                    res.send({ user_token: 'Bearer ' + user_token, newEntry: userExist.newEntry, message: 'Login success!' });
                }
                else {
                    const user = {
                        email: email,
                        password: passwordHash,
                        email_verified: email_verified
                    };
                    const result = await usersCollection.insertOne(user);
                    const user_token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET);

                    result && res.send({ user_token: 'Bearer ' + user_token, newEntry: true, message: 'Login success!' });
                }

            } catch (err) {
                if (err) return res.status(500).send({ message: err.message })
            }
        });

        // ========================Admin route========================
        app.get('/admin', accessAuth, async (req, res) => {
            try {
                const user = await usersCollection.findOne({ email: req.decoded.email });
                const isAdmin = user.admin === true;
                if (!isAdmin) return res.status(401).send({
                    message: "Unauthorized access!",
                    logout: true
                });
                res.send({ admin: isAdmin })
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.get('/users', accessAuth, async (req, res) => {
            try {
                const query = {};
                const cursor = usersCollection.find(query);
                const allUser = await cursor.toArray();
                res.send(allUser);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });

        app.delete('/admin_delete/:email', accessAuth, async (req, res) => {
            try {
                const email = req.params.email;
                const query1 = { email: email };
                const query2 = { employerEmail: email };
                const query3 = { seekerEmail: email };
                const userResult = await usersCollection.deleteOne(query1);
                const epmResult = await jobPostCollection.deleteOne(query2);
                const appResult = await applyJobCollection.deleteOne(query3);
                res.send(userResult, epmResult, appResult)
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/payment_required/:id', accessAuth, async (req, res) => {
            try {
                const id = req.params.id;
                const filter = { _id: ObjectId(id) };
                const options = { upsert: true };
                const updateDoc = {
                    $set: req.body
                };

                const result = await usersCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });

        // ========================Users data========================
        app.get('/users/get_single_user', accessAuth, async (req, res) => {
            try {
                const email = { email: req.decoded.email };

                const result = await usersCollection.findOne(email);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });

        app.put('/users/newEntry', accessAuth, async (req, res) => {
            try {
                const filter = { email: req.decoded.email };
                const options = { upsert: true };
                const admin = req.body.admin;
                const seeker = req.body.seeker;
                const employer = req.body.employer;
                const newEntry = req.body.newEntry;
                const updateDoc = employer ? {
                    $set: {
                        admin: admin,
                        seeker: seeker,
                        employer: employer,
                        newEntry: newEntry,
                        subscription: 'free',
                    }
                } : {
                    $set: {
                        admin: admin,
                        seeker: seeker,
                        employer: employer,
                        newEntry: newEntry
                    }
                };
                const result = await usersCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });

        app.put('/employer_data/update', accessAuth, async (req, res) => {
            try {
                const filter = { email: req.decoded.email };
                const options = { upsert: true };
                const user = req.body;
                const updateDoc = {
                    $set: user
                };
                const result = await usersCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });

        app.get('/users/candidates_data/:email', async (req, res) => {
            try {
                const email = req.params.email;
                const query = { email: email };
                const cursor = usersCollection.find(query);
                const userInfo = await cursor.toArray();
                res.send(userInfo);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        // ========================Seeker data========================
        app.put('/seeker_data', accessAuth, async (req, res) => {
            try {
                const filter = { email: req.decoded.email };
                const options = { upsert: true };

                const user = req.body;
                const uc = user.userContact ? user.userContact : '';
                const uj = user.jobExp ? user.jobExp : '';
                const ue = user.education;
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
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/seeker_data/update', accessAuth, async (req, res) => {
            try {
                const filter = { email: req.decoded.email };
                const options = { upsert: true };
                const user = req.body;
                const updateDoc = {
                    $set: user
                };
                const result = await usersCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });

        app.put('/seeker/add-education', accessAuth, async (req, res) => {
            try {
                const filter = { email: req.decoded.email };
                const options = { upsert: true };
                const education = req.body;
                const updateDoc = {
                    $push: { education: education }
                };
                const result = await usersCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });

        app.patch('/seeker/delete-education', accessAuth, async (req, res) => {
            try {
                const filter = { email: req.decoded.email };
                const options = { multi: true };
                const edu = req.body;
                const education = edu.edu;
                const updateDoc = {
                    $pull: { education: education }
                };
                const result = await usersCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });

        app.put('/seeker/add-jobExperience', accessAuth, async (req, res) => {
            try {
                const filter = { email: req.decoded.email };
                const options = { upsert: true };
                const jobExperience = req.body;
                const updateDoc = {
                    $push: { jobExperience: jobExperience }
                };
                const result = await usersCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });

        app.patch('/seeker/delete-jobExperience', accessAuth, async (req, res) => {
            try {
                const filter = { email: req.decoded.email };
                const options = { multi: true };
                const ex = req.body;
                const jobExperience = ex.ex;
                const updateDoc = {
                    $pull: { jobExperience: jobExperience }
                };
                const result = await usersCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });

        app.put('/seeker/update-resume', accessAuth, async (req, res) => {
            try {
                const filter = { email: req.decoded.email };
                const options = { upsert: true };
                const resume = req.body;
                const updateDoc = {
                    $set: resume
                };
                const result = await usersCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });


        // ========================Job post========================
        app.post('/post', accessAuth, async (req, res) => {
            try {
                const user = req.body;
                const po = user.postOptions;
                const ec = user.employerContact;
                const jobData = {
                    permission: false,
                    jobTitle: ec.jobTitle ? ec.jobTitle : '',
                    company: ec.company ? ec.company : '',
                    workplace: ec.workplace ? ec.workplace : '',
                    jobLocation: ec.jobLocation ? ec.jobLocation : '',
                    empQuantity: ec.empQuantity ? ec.empQuantity : '',
                    empType: ec.empType ? ec.empType : '',
                    jobDescription: user.jobDescription ? user.jobDescription : '',
                    terms: user.terms ? user.terms : '',
                    employerEmail: user.email ? user.email : '',
                    receiveEmail: po.receiveEmail ? po.receiveEmail : '',
                    salary: po.salary ? po.salary : '',
                    skillTags: po.skillTags ? po.skillTags : '',
                    bgCheck: user.bgCheck ? user.bgCheck : '',
                    certification: user.certification ? user.certification : '',
                    drivingLicense: user.drivingLicense ? user.drivingLicense : '',
                    drugTest: user.drugTest ? user.drugTest : '',
                    education: user.education ? user.education : '',
                    gpa: user.gpa ? user.gpa : '',
                    hybridWork: user.hybridWork ? user.hybridWork : '',
                    remoteWork: user.remoteWork ? user.remoteWork : '',
                    workExperience: user.workExperience ? user.workExperience : '',
                    urgentHiring: user.urgentHiring ? user.urgentHiring : '',
                    customQuestion: user.customQuestion ? user.customQuestion : ''
                };
                const result = await jobPostCollection.insertOne(jobData);


                // For Notification
                const notification = {
                    postId: result.insertedId,
                    jobTitle: ec.jobTitle ? ec.jobTitle : '',
                    company: ec.company ? ec.company : '',
                    notifyAdmin: true,
                    permission: false,
                    notifyUsers: []
                };
                await notificationCollection.insertOne(notification);

                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.get('/post', async (req, res) => {
            try {
                const query = {};
                const cursor = jobPostCollection.find(query);
                const allPost = await cursor.toArray();
                res.send(allPost);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.get('/post/get_single_post', accessAuth, async (req, res) => {
            try {
                const query = { employerEmail: req.decoded.email };
                const cursor = jobPostCollection.find(query);
                const post = await cursor.toArray();
                res.send(post);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/post/:id', accessAuth, async (req, res) => {
            try {
                // Find user
                const email = { email: req.body.employerEmail };
                const findData = await usersCollection.findOne(email);

                // Update post
                const id = req.params.id;
                const user = req.body;
                const options = { upsert: true };
                const query1 = { _id: ObjectId(id) };
                const updatePost = {
                    $set: {
                        permission: user.permission,
                        publish: user.publish,
                        postType: findData.subscription === 'per_post' || findData.subscription === 'paid' ? 'paid' : 'free'
                    }
                };
                const postResult = await jobPostCollection.updateOne(query1, updatePost, options);

                // For Subscription
                if (findData.subscription === 'per_post') {
                    const filter = { _id: ObjectId(findData._id) };
                    const options = { upsert: true };
                    const updateDoc = {
                        $set: {
                            subscription: 'required'
                        }
                    };
                    await usersCollection.updateOne(filter, updateDoc, options);
                };

                // For notification
                const query2 = { postId: ObjectId(id) };
                const updateNotify = {
                    $set: {
                        permission: true
                    }
                };
                const notifyResult = await notificationCollection.updateOne(query2, updateNotify, options);

                res.send({ postResult, notifyResult })
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.delete('/post/:id', accessAuth, async (req, res) => {
            try {
                const id = req.params.id;
                const query1 = { _id: ObjectId(id) };
                const query2 = { postID: id };
                const query3 = { postId: ObjectId(id) };
                const result1 = await jobPostCollection.deleteOne(query1);
                const result2 = await applyJobCollection.deleteOne(query2);
                const result3 = await notificationCollection.deleteOne(query3);
                res.send({ result1, result2, result3 })
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/update-post-info/:id', accessAuth, async (req, res) => {
            try {
                const id = req.params.id;
                const data = req.body;
                const options = { upsert: true };
                const query1 = { _id: ObjectId(id) };
                const updatePost = {
                    $set: {
                        jobTitle: data.jobTitle,
                        company: data.company,
                        workplace: data.workplace,
                        jobLocation: data.jobLocation,
                        empQuantity: data.empQuantity,
                        empType: data.empType,
                        salary: data.salary,
                        receiveEmail: data.receiveEmail,
                    }
                };
                const result = await jobPostCollection.updateOne(query1, updatePost, options);
                res.send(result)
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/update-des-and-terms/:id', accessAuth, async (req, res) => {
            try {
                const id = req.params.id;
                const data = req.body;
                const options = { upsert: true };
                const query1 = { _id: ObjectId(id) };
                const updatePost = data.jobDescription && {
                    $set: {
                        jobDescription: data.jobDescription,
                    }
                } || data.terms && {
                    $set: {
                        terms: data.terms,
                    }
                };
                const result = await jobPostCollection.updateOne(query1, updatePost, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        // ========================Notifications========================
        app.get('/notifications', accessAuth, async (req, res) => {
            try {
                const query = {};
                const cursor = notificationCollection.find(query);
                const allPost = await cursor.toArray();
                res.send(allPost);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/admin_seen_notification/:id', accessAuth, async (req, res) => {
            try {
                const id = req.params.id;
                const data = req.body;

                const query = { _id: ObjectId(id) };
                const options = { upsert: true };
                const updateDoc = {
                    $set: data
                };
                const result = await notificationCollection.updateOne(query, updateDoc, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/seeker_seen_notification/:id', accessAuth, async (req, res) => {
            try {
                const id = req.params.id;
                const seekerId = req.body.seekerId;
                const query = { _id: ObjectId(id) };
                const options = { upsert: true };
                const updateDoc = {
                    $push: { notifyUsers: seekerId }
                };
                const result = await notificationCollection.updateOne(query, updateDoc, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });


        // ========================Seeker apply job========================
        app.post('/apply', accessAuth, async (req, res) => {
            try {
                const data = req.body;
                const result = await applyJobCollection.insertOne(data);
                emailSender(data, 'coverLetter');
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/apply/offer_letter_send/:id', accessAuth, async (req, res) => {
            try {
                const id = req.params.id;
                const data = req.body;
                const query = { _id: ObjectId(id) };
                const options = { upsert: true };
                const updateDoc = {
                    $set: { offerLetter: true }
                };
                const result = await applyJobCollection.updateOne(query, updateDoc, options);
                emailSender(data, 'offerLetter');
                res.send(result)
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.get('/apply/get_single_apply', accessAuth, async (req, res) => {
            try {
                const query = { seekerEmail: req.decoded.email };
                const cursor = applyJobCollection.find(query);
                const result = await cursor.toArray();
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.get('/apply/seeker_applications', accessAuth, async (req, res) => {
            try {
                const query = { employerEmail: req.decoded.email };
                const cursor = applyJobCollection.find(query);
                const result = await cursor.toArray();
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.get('/admin-applied-list/:id', accessAuth, async (req, res) => {
            try {
                const id = req.params.id;
                const query = { postID: id };
                const cursor = applyJobCollection.find(query);
                const result = await cursor.toArray();
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });


        // ========================Payments========================
        app.post('/create-payment-intent', accessAuth, async (req, res) => {
            try {
                const { amount } = req.body;
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount * 100,
                    currency: 'usd',
                    payment_method_types: ['card']
                });
                res.status(200).send({ clientSecret: paymentIntent.client_secret });
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });
        app.post('/payment-complete', accessAuth, async (req, res) => {
            try {
                const data = req.body;
                const result = await paymentsCollection.insertOne(data);

                const filter = { email: data.email };
                const options = { upsert: true };
                const updateDoc = {
                    $set: {
                        subscription: data.paymentSystem === 'One time' ? 'paid' : 'per_post'
                    }
                };
                const update = await usersCollection.updateOne(filter, updateDoc, options);

                res.send({ result, update });
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });
        app.get('/payment-complete', accessAuth, async (req, res) => {
            try {
                const query = {};
                const data = paymentsCollection.find(query);
                const allPayment = await data.toArray();
                res.send(allPayment);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });


    }
    finally { }
};
run().catch(console.dir);


app.get('/', async (req, res) => {
    res.send('Server is running successfully!')
});

app.listen(port, () => {
    console.log("Backend server is running!")
})