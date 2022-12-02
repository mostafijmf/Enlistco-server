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
        app.get('/admin', accessAuth(usersCollection), async (req, res) => {
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

        app.get('/users', accessAuth(usersCollection), async (req, res) => {
            try {
                const query = {};
                const cursor = usersCollection.find(query);
                const allUser = await cursor.toArray();
                res.send(allUser);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });

        app.delete('/admin_delete/:email', accessAuth(usersCollection), async (req, res) => {
            try {
                const email = req.params.email;
                const query1 = { email: email };
                const query2 = { employerEmail: email };
                const query3 = { seekerEmail: email };
                const userResult = await usersCollection.deleteOne(query1);
                const epmResult = await jobPostCollection.deleteMany(query2);
                const appResult1 = await applyJobCollection.deleteMany(query3);
                const appResult2 = await applyJobCollection.deleteMany(query2);
                const notifResult = await notificationCollection.deleteMany(query2);
                res.send(userResult, epmResult, appResult1, appResult2, notifResult)
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/payment_required/:id', accessAuth(usersCollection), async (req, res) => {
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
        app.get('/users/get_single_user', accessAuth(usersCollection), async (req, res) => {
            try {
                const email = { email: req.decoded.email };

                const result = await usersCollection.findOne(email);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });

        app.put('/users/newEntry', accessAuth(usersCollection), async (req, res) => {
            try {
                const user = req.body;
                const filter = { email: req.decoded.email };
                const options = { upsert: true };
                const updateDoc = user.employer ? {
                    $set: {
                        admin: user.admin,
                        seeker: user.seeker,
                        employer: user.employer,
                        newEntry: user.newEntry,
                        subscription: 'free',
                        firstName: user.userInfo.firstName,
                        lastName: user.userInfo.lastName,
                        phone: user.userInfo.phone,
                        country: user.userInfo.country,
                        address: user.userInfo.address,
                        state: user.userInfo.state,
                        zip: user.userInfo.zip,
                    }
                } : {
                    $set: {
                        admin: user.admin,
                        seeker: user.seeker,
                        employer: user.employer,
                        newEntry: user.newEntry,
                        firstName: user.userInfo.firstName,
                        lastName: user.userInfo.lastName,
                        phone: user.userInfo.phone,
                        country: user.userInfo.country,
                        address: user.userInfo.address,
                        state: user.userInfo.state,
                        zip: user.userInfo.zip,
                    }
                };
                const result = await usersCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message })
            }
        });

        app.put('/employer_data/update', accessAuth(usersCollection), async (req, res) => {
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
        app.put('/seeker_data', accessAuth(usersCollection), async (req, res) => {
            try {
                const filter = { email: req.decoded.email };
                const options = { upsert: true };

                const user = req.body;
                const uc = user.userContact ? user.userContact : '';
                const us = user.seekerAbout ? user.seekerAbout : '';
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
                        seekerAbout: us.seekerAbout ? us.seekerAbout : '',
                        seekerTitle: us.seekerTitle ? us.seekerTitle : '',
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
                        resume: user.resume,
                    }
                };
                const update = await usersCollection.updateOne(filter, updateDoc, options);
                res.send(update);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/seeker_data/update', accessAuth(usersCollection), async (req, res) => {
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

        app.put('/seeker/add-education', accessAuth(usersCollection), async (req, res) => {
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

        app.patch('/seeker/delete-education', accessAuth(usersCollection), async (req, res) => {
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

        app.put('/seeker/add-jobExperience', accessAuth(usersCollection), async (req, res) => {
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

        app.patch('/seeker/delete-jobExperience', accessAuth(usersCollection), async (req, res) => {
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

        app.put('/seeker/update-resume', accessAuth(usersCollection), async (req, res) => {
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
        app.post('/post', accessAuth(usersCollection), async (req, res) => {
            try {
                const user = req.body;
                const jc = user.jobContact;
                const appOpt = user.appOptions;
                const jobData = {
                    permission: false,

                    // jobContact
                    jobTitle: jc.jobTitle ? jc.jobTitle : '',
                    company: jc.company ? jc.company : '',
                    workplace: jc.workplace ? jc.workplace : '',
                    jobLocation: jc.jobLocation ? jc.jobLocation : '',
                    empQuantity: jc.empQuantity ? jc.empQuantity : '',
                    empType: jc.empType ? jc.empType : '',

                    jobDescription: user.jobDescription ? user.jobDescription : '',
                    terms: user.terms ? user.terms : '',

                    // appOptions
                    employerEmail: appOpt.email ? appOpt.email : '',
                    receiveEmail: appOpt.receiveEmail ? appOpt.receiveEmail : '',
                    applyType: appOpt.applyType ? appOpt.applyType : '',
                    salary: appOpt.salary ? appOpt.salary : '',
                    skillTags: appOpt.skillTags ? appOpt.skillTags : '',
                    bgCheck: appOpt.bgCheck ? appOpt.bgCheck : '',
                    certification: appOpt.certification ? appOpt.certification : '',
                    drivingLicense: appOpt.drivingLicense ? appOpt.drivingLicense : '',
                    drugTest: appOpt.drugTest ? appOpt.drugTest : '',
                    education: appOpt.education ? appOpt.education : '',
                    gpa: appOpt.gpa ? appOpt.gpa : '',
                    hybridWork: appOpt.hybridWork ? appOpt.hybridWork : '',
                    remoteWork: appOpt.remoteWork ? appOpt.remoteWork : '',
                    workExperience: appOpt.workExperience ? appOpt.workExperience : '',
                    urgentHiring: appOpt.urgentHiring ? appOpt.urgentHiring : '',
                    customQuestion: appOpt.customQuestion ? appOpt.customQuestion : '',

                    jobStatus: 'Open'
                };
                const result = await jobPostCollection.insertOne(jobData);


                // For Notification
                const notification = {
                    postId: result.insertedId,
                    jobTitle: jc.jobTitle ? jc.jobTitle : '',
                    company: jc.company ? jc.company : '',
                    employerEmail: appOpt.email ? appOpt.email : '',
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

        app.get('/post/get_single_post', accessAuth(usersCollection), async (req, res) => {
            try {
                const query = { employerEmail: req.decoded.email };
                const cursor = jobPostCollection.find(query);
                const post = await cursor.toArray();
                res.send(post);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.get('/post/get_single_post/:id', accessAuth(usersCollection), async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: ObjectId(id) };
                const cursor = await jobPostCollection.findOne(query);
                res.send(cursor);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/post/permission/:id', accessAuth(usersCollection), async (req, res) => {
            try {
                const email = { email: req.body.employerEmail };
                const id = req.params.id;
                const user = req.body;
                const options = { upsert: true };
                const query1 = { _id: ObjectId(id) };

                // Permission Edited post
                if (req.query.isEdited) {
                    const updatePost = {
                        $set: {
                            permission: user.permission,
                            postEdited: false,
                        }
                    };
                    const postResult = await jobPostCollection.updateOne(query1, updatePost, options);
                    res.send({ postResult });
                }
                else {
                    // Find user
                    const findData = await usersCollection.findOne(email);

                    // For Subscription
                    if (findData.subscription === 'per_post') {
                        const filter = { _id: ObjectId(findData._id) };
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

                    // Update post
                    const updatePost = {
                        $set: {
                            permission: user.permission,
                            publish: user.publish,
                            postType: findData.subscription === 'per_post' || findData.subscription === 'paid' ? 'paid' : 'free'
                        }
                    };
                    const postResult = await jobPostCollection.updateOne(query1, updatePost, options);

                    // Job Alert
                    const query = { seeker: true };
                    const jobPost = await jobPostCollection.findOne(query1);
                    const find = await usersCollection.find(query).toArray();

                    const matchTitle = find.filter(f =>
                        f.seekerTitle.toLocaleLowerCase()
                        ===
                        jobPost.jobTitle.toLocaleLowerCase()
                    );

                    const findEmail = matchTitle.map(f => f.email);

                    emailSender({
                        jobPost,
                        publish: user.publish,
                        findEmail,
                        seekerTitle: matchTitle[0].seekerTitle
                    }, 'jobAlert');

                    res.send({ postResult, notifyResult });
                };

            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.delete('/post/:id', accessAuth(usersCollection), async (req, res) => {
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

        app.put('/update_post/:id', accessAuth(usersCollection), async (req, res) => {
            try {
                const id = req.params.id;
                const data = req.body;
                const query1 = { _id: ObjectId(id) };
                const query2 = { postId: ObjectId(id) };
                const options = { upsert: true };

                if (req.query.postInfo) {
                    const updatePost = {
                        $set: {
                            jobTitle: data.jobTitle,
                            company: data.company,
                            workplace: data.workplace,
                            jobLocation: data.jobLocation,
                            empQuantity: data.empQuantity,
                            empType: data.empType,
                            salary: data.salary,
                            permission: data.permission,
                            postEdited: true
                        }
                    };
                    const result = await jobPostCollection.updateOne(query1, updatePost, options);

                    // For Notification
                    const notification = {
                        $set: {
                            notifyAdmin: true,
                            postEdited: true
                        }
                    };
                    await notificationCollection.updateOne(query2, notification, options);

                    res.send(result)
                }
                else if (req.query.description) {
                    const updatePost = {
                        $set: {
                            jobDescription: data.jobDescription,
                            permission: data.permission,
                            postEdited: true
                        }
                    };
                    const result = await jobPostCollection.updateOne(query1, updatePost, options);

                    // For Notification
                    const notification = {
                        $set: {
                            notifyAdmin: true,
                            postEdited: true
                        }
                    };
                    await notificationCollection.updateOne(query2, notification, options);

                    res.send(result);
                }
                else if (req.query.applicationOpts) {
                    const updatePost = {
                        $set: {
                            applyType: data.applyType,
                            receiveEmail: data.receiveEmail,
                            skillTags: data.skillTags,
                            permission: data.permission,
                            postEdited: true
                        }
                    };
                    const result = await jobPostCollection.updateOne(query1, updatePost, options);

                    // For Notification
                    const notification = {
                        $set: {
                            notifyAdmin: true,
                            postEdited: true
                        }
                    };
                    await notificationCollection.updateOne(query2, notification, options);

                    res.send(result);
                }
                else if (req.query.terms) {
                    const updatePost = {
                        $set: {
                            terms: data.terms,
                            permission: data.permission,
                            postEdited: true
                        }
                    };
                    const result = await jobPostCollection.updateOne(query1, updatePost, options);

                    // For Notification
                    const notification = {
                        $set: {
                            notifyAdmin: true,
                            postEdited: true
                        }
                    };
                    await notificationCollection.updateOne(query2, notification, options);

                    res.send(result);
                }
                else if (req.query.addQuestions) {
                    const updatePost = {
                        $set: {
                            bgCheck: data.bgCheck,
                            certification: data.certification,
                            drivingLicense: data.drivingLicense,
                            drugTest: data.drugTest,
                            education: data.education,
                            gpa: data.gpa,
                            hybridWork: data.hybridWork,
                            remoteWork: data.remoteWork,
                            workExperience: data.workExperience,
                            urgentHiring: data.urgentHiring,
                            customQuestion: data.customQuestion,
                            permission: data.permission,
                            postEdited: true
                        }
                    };
                    const result = await jobPostCollection.updateOne(query1, updatePost, options);

                    // For Notification
                    const notification = {
                        $set: {
                            notifyAdmin: true,
                            postEdited: true
                        }
                    };
                    await notificationCollection.updateOne(query2, notification, options);

                    res.send(result);
                }

            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/job_status/:id', accessAuth(usersCollection), async (req, res) => {
            try {
                const id = req.params.id;
                const { jobStatus } = req.body;
                const options = { upsert: true };
                const query1 = { _id: ObjectId(id) };
                const updatePost = {
                    $set: {
                        jobStatus
                    }
                };
                const result = await jobPostCollection.updateOne(query1, updatePost, options);
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        // ========================Seeker apply job========================
        app.post('/apply', accessAuth(usersCollection), async (req, res) => {
            try {
                const data = req.body;
                const result = await applyJobCollection.insertOne(data);
                emailSender(data, 'coverLetter');
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/apply/offer_letter_send/:id', accessAuth(usersCollection), async (req, res) => {
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

        app.get('/apply/get_single_apply', accessAuth(usersCollection), async (req, res) => {
            try {
                const query = { seekerEmail: req.decoded.email };
                const cursor = applyJobCollection.find(query);
                const result = await cursor.toArray();
                res.send(result);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.get('/apply/seeker_applications', accessAuth(usersCollection), async (req, res) => {
            try {
                if (req.query.id) {
                    const query = { postID: req.query.id };
                    const cursor = applyJobCollection.find(query);
                    const result = await cursor.toArray();
                    res.send(result);
                }
                else {
                    const query = { employerEmail: req.decoded.email };
                    const cursor = applyJobCollection.find(query);
                    const result = await cursor.toArray();
                    res.send(result);
                }
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.get('/admin-applied-list/:id', accessAuth(usersCollection), async (req, res) => {
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


        // ========================Notifications========================
        app.get('/notifications', accessAuth(usersCollection), async (req, res) => {
            try {
                const query = {};
                const cursor = notificationCollection.find(query);
                const allPost = await cursor.toArray();
                res.send(allPost);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });

        app.put('/admin_seen_notification/:id', accessAuth(usersCollection), async (req, res) => {
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

        app.put('/seeker_seen_notification/:id', accessAuth(usersCollection), async (req, res) => {
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



        // ========================Payments========================
        app.post('/create-payment-intent', accessAuth(usersCollection), async (req, res) => {
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
        app.post('/payment-complete', accessAuth(usersCollection), async (req, res) => {
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
        app.get('/payment-complete', accessAuth(usersCollection), async (req, res) => {
            try {
                const query = {};
                const data = paymentsCollection.find(query);
                const allPayment = await data.toArray();
                res.send(allPayment);
            } catch (error) {
                if (error) return res.status(500).send({ message: error.message });
            }
        });



        // ========================Contact Us========================
        app.post('/contact_us', async (req, res) => {
            try {
                const data = req.body;
                emailSender(data, 'contact_us')
                res.status(200).send({ success: true });
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