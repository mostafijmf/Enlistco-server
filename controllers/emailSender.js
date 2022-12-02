const nodemailer = require('nodemailer');


const emailSender = (data, text) => {
    const smtpTransport = nodemailer.createTransport({
        host: "mail.smtp2go.com",
        port: 2525, // 8025, 587 and 25 can also be used.
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    // ================Job Alert================
    if (text === 'jobAlert') {
        const { jobPost, publish, findEmail, seekerTitle } = data;
        const email = findEmail.join(', ');

        smtpTransport.sendMail({
            from: {
                name: 'Enlistco',
                address: process.env.SENDER_EMAIL
            },
            to: email,
            subject: `A new job for “${jobPost.jobTitle}”`,
            html: `<div
            style='background-color: #f3f9ff; padding: 40px 0; font-family: Arial, Helvetica, sans-serif;'>
            <div style='width: 500px; margin: 0 auto; border-radius: 8px; background-color: white; padding: 30px;'>
                <h2 style='text-align: center; margin: 0; font-size: 24px; color: #444;'>
                    <a href=${process.env.CLIENT_URL} style="text-decoration: none; color: #1abc9c;">Enlistco</a>
                </h2>
                <h4 style='text-align: center; font-size: 20px; color: #444; font-weight: 400; margin-bottom: 1rem;'>
                    Your job alert for ${seekerTitle}
                </h4>
                <hr />
                <div style='padding: 20px 0;'>
                    <h4 style='margin: 0;'>
                        <a href=${`${process.env.CLIENT_URL}/job/${jobPost._id}`} style='text-decoration: none; color: #1abc9c; font-size: 20px; font-weight: 400; margin-bottom: 5px; margin-top: 0; display: block;' >
                            ${jobPost.jobTitle}
                        </a>
                    </h4>
                    <p style='margin: 5px 0 0 0; font-size: 14px; color: #555555; font-weight: 400;'>
                        ${jobPost.company},<span style="margin-left: 5px;">${jobPost.jobLocation}</span><span style="margin-left: 5px;">(${jobPost.workplace})</span>
                    </p>
                    <p style='margin: 5px 0 5px 0px; font-size: 14px; color: #555555; font-weight: 400;'>
                        $${jobPost.salary}
                    </p>
                    <p style='margin: 0; color: #555555; font-weight: 400;'>
                        Posted in ${publish}
                    </p>
                </div>
                <div style='width: 100%; text-align: start; margin-top: 20px; margin-bottom: 30px;'>
                    <a href=${`${process.env.CLIENT_URL}/job/${jobPost._id}`}
                        style='padding: 8px 15px; border-radius: 5px; background-color: #1abc9c; text-decoration: none; color: white; font-size: 16px;'>
                        See Job
                    </a>
                </div>
            </div>
        </div>`
        }, function (error, response) { });
    };

    // ================Verification email send================
    if (text === 'verify') {
        const { email, url } = data;
        smtpTransport.sendMail({
            from: {
                name: 'Enlistco',
                address: process.env.SENDER_EMAIL
            },
            to: email,
            subject: 'Please verify your email address',
            html: `
            <div style="width: 100%; background-color: #F1F5F9; padding: 40px 0; font-family: 'Lato',sans-serif;">
        <style>
            @media (max-width: 600px) {
                #box{
                    width: 95% !important;
                    margin: 0 auto !important;
                }
            }
        </style>
        <div id="box" style='width: 500px; margin: 0 auto; border-radius: 8px; background-color: white; padding: 30px;'>
            <h2 style='text-align: center; margin: 10px 0 30px 0; font-size: 26px; color: #1abc9c;'>Enlistco</h2>
            <div>
                <img src="https://res.cloudinary.com/job-portal/image/upload/v1663523466/don%27t%20delete%20it.%20email%20verify%20img.png"
                    alt="Email icon"
                    style="width: 200px; max-width: 400px; height: auto; margin: auto; display: block;">
            </div>
            <div style='padding: 20px 0;'>
                <h1 style="margin: 0; text-align: center; font-size: 30px; font-weight: 600; color: gray;">Please verify your email</h1>
                <h3 style="margin: 10px 0; text-align: center; font-size: 18px; font-weight: 500; color: #363636;">To help us confirm it’s you, please click the button below to activate your account.</h3>
            </div>
            <p style="text-align: center; margin-bottom: 20px">
                <a href=${url}
                    style='padding: 15px 20px; border-radius: 5px; background-color: #1abc9c; text-decoration: none; color: #ffffff; font-size: 18px; font-weight: 500;'
                    >
                    Verify email address
                </a>
            </p>
        </div>
        <p style="text-align: center; color: #363636;">&copy; Enlistco</p>
    </div>
        `
        }, function (error, response) { });
    };

    // ================Password reset email send================
    if (text === 'reset') {
        const { email, url } = data;
        smtpTransport.sendMail({
            from: {
                name: 'Enlistco',
                address: process.env.SENDER_EMAIL
            },
            to: email,
            subject: 'Reset your password',
            html: `
            <div style="width: 100%; background-color: #F1F5F9; padding: 40px 0; font-family: 'Lato',sans-serif;">
        <style>
            @media (max-width: 600px) {
                #box{
                    width: 95% !important;
                    margin: 0 auto !important;
                }
            }
        </style>
        <div id="box" style='width: 500px; margin: 0 auto; border-radius: 8px; background-color: white; padding: 30px;'>
            <h2 style='text-align: center; margin: 10px 0 30px 0; font-size: 26px; color: #1abc9c;'>Enlistco</h2>
            <div>
                <img src="https://res.cloudinary.com/job-portal/image/upload/v1663752955/Don%27t-delete-reset-password-icon.png"
                    alt="Email icon"
                    style="width: 180px; max-width: 100%; height: auto; margin: auto; display: block;">
            </div>
            <div style='padding: 20px 0;'>
                <h3 style="margin: 0; font-size: 18px; font-weight: 500; color: #555555;">Hello ${email}</h3>
                <p style="margin: 15px 0; font-size: 17px; font-weight: 500; color: #555555;">You recently requested to reset your password. To select a new password, click on the button below:</p>
            </div>
            <p style="text-align: center; margin: 0 0 30px 0;">
                <a href=${url}
                    style='padding: 10px 20px; border-radius: 5px; background-color: #1abc9c; text-decoration: none; color: #ffffff; font-size: 18px; font-weight: 500;'>
                    Reset Password
                </a>
            </p>
        </div>
        <p style="text-align: center; color: #363636;">&copy; Enlistco</p>
    </div>
        `
        });
    };

    // ================Cover letter send================
    if (text === 'coverLetter') {
        const { resume, subject, coverLetter, seekerEmail, seekerName, postID, receiveEmail, jobTitle } = data;
        smtpTransport.sendMail({
            from: {
                name: 'Enlistco',
                address: process.env.SENDER_EMAIL
            },
            to: receiveEmail,
            subject: subject,
            html: `<div style='background-color: #f3f9ff; padding: 40px 0;'><div style='width: 500px; margin: 0 auto; border-radius: 8px; background-color: white; padding: 30px;'><h2 style='text-align: center; margin: 0; font-size: 24px; color: #444;'>Enlistco</h2><h4 style='text-align: center; font-size: 20px; color: #444; font-weight: 400;'>You've received a cover letter from ${seekerName}</h4><hr/><div style='padding: 20px 0; color: #1abc9c;'><p style='margin: 0; font-size: 19px;'>Hi,</p><p style='margin: 0; font-size: 19px;'>${seekerName} wrote a cover letter to you in regards to ${jobTitle}</p></div><div style='background-color: #F1F5F9; padding: 20px; border-radius: 8px;'><p style='margin: 0; color: #7b7b7b; font-size: 18px;'>${coverLetter}</p></div><div style='width: 100%; text-align: center; margin-top: 20px;'><a href=${resume} style='padding: 8px 15px; border-radius: 5px; background-color: #1abc9c; text-decoration: none; color: white; font-size: 20px;'>See Resume</a></div><div style='width: 100%; text-align: center; margin-top: 30px;'><a href=${'https://enlistco.co.in/dashboard/seeker-applications'} style='padding: 8px 15px; border-radius: 5px; font-size: 20px;'>See seeker list</a></div></div></div>`
        }, function (error, response) { });
    }

    // ================Offer letter send================
    if (text === 'offerLetter') {
        const { seekerEmail, seekerName, jobTitle, company, subject, offerLetter } = data;
        smtpTransport.sendMail({
            from: {
                name: 'Enlistco',
                address: process.env.SENDER_EMAIL
            },
            to: seekerEmail,
            subject: subject,
            html: `<div style='background-color: #f3f9ff; padding: 40px 0;'><div style='width: 500px; margin: 0 auto; border-radius: 8px; background-color: white; padding: 30px;'><h2 style='text-align: center; margin: 0; font-size: 24px; color: #444;'>Enlistco</h2><h4 style='text-align: center; font-size: 20px; color: #444; font-weight: 400;'>Great news, You've received an offer letter.</h4><hr /><div style='padding: 20px 0; color: #1abc9c;'><p style='margin: 0; font-size: 19px;'>Hi, ${seekerName}</p><p style='margin: 0; font-size: 19px;'>You've just received an offer letter from ${company} for the ${jobTitle} position.</p></div><div style='background-color: #F1F5F9; padding: 20px; border-radius: 8px;'><p style='margin: 0; color: #7b7b7b; font-size: 19px;'>${offerLetter}</p></div></div></div>`
        }, function (error, response) { });
    };

    // ================Contact Us================
    if (text === 'contact_us') {
        const { name, email, phone, message } = data;
        smtpTransport.sendMail({
            from: {
                name: 'Enlistco',
                address: email
            },
            to: process.env.SENDER_EMAIL,
            subject: `A new message from Contact-us page written by ${name}`,
            html: `<div>
            <p>${message}</p>
            <p style="margin: 0;">${name}</p>
            <p style="margin: 0;">${phone}</p>
            <p style="margin: 0;">${email}</p>
            </div>`
        }, function (error, response) { });
    };
};

module.exports = emailSender;