const jwt = require('jsonwebtoken');


const authorize = {
    activationAuth: (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).send({ message: "Unauthorized access!" });

            jwt.verify(authHeader, process.env.ACTIVATION_TOKEN_SECRET, (err, decoded) => {
                if (err) return res.status(403).send({ message: "Forbidden access!" });
                req.decoded = decoded;
                next();
            })
        } catch (err) {
            return res.status(500).send({ message: err.message })
        }
    },
    accessAuth: (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).send({ 
                message: "Unauthorized access!", 
                logout: true 
            });

            const token = authHeader.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) return res.status(403).send({ message: "Forbidden access!", logout: true });
                req.decoded = decoded;
                next();
            })
        } catch (err) {
            return res.status(500).send({ message: err.message })
        }
    }
}

module.exports = authorize;