import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv"
import bcrypt from "bcrypt"
import session from "express-session";


const app = express();
const port = 3000;
env.config();
const saltRound = 8;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(
    session({
        secret: process.env.SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24,
        }
    })
);

app.use(function (req, res, next) {
    res.locals.user = req.session.user || null;
    res.locals.isAuthenticated = !!req.session.user;
    next();
});

const db = new pg.Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: "ecommerce"
});

if (db.connect()) {
    console.log("Database connected successfully");
} else {
    console.log("Something went wrong");
}

// GET Routes
app.get("/", (req, res) => {
    res.render("index.ejs")
});

app.get("/login", (req, res) => {
    if (req.session.user) {
        return res.redirect("screens/order");
    } else {
        res.render("screens/login.ejs", { error: req.query.error });
    }

});

app.get("/register", (req, res) => {
    if (req.session.user) {
        return res.redirect("screens/order");
    }
    res.render("screens/register.ejs", { error: req.query.error });
});

app.get("/order", (req, res) => {
    if(req.session.user){
        res.render("screens/order.ejs")
    }else{
        res.redirect("/login");
    }
   
});

app.get("/product", (req, res) => {
    if(req.session.user){
        res.render("screens/product.ejs");
    }else{
        res.redirect("/login");
    }
    
});

app.get("/customer", (req, res) => {
    if(req.session.user){
        res.render("screens/customer.ejs");
    }else{
        res.redirect("/login");
    }
    
});

app.get("/about", (req, res) => {
    res.render("screens/about.ejs");
});

app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log("Error during logout:", err);
            return res.redirect("/");
        }
        res.clearCookie("connect.sid"); // Clear the session cookie
        res.redirect("/");
    });

});


// POST Routes
app.post("/login", async (req, res) => {
    const email = req.body.username;
    const password = req.body.password;
    const role = "Admin"
    try {
        const result = await db.query(`SELECT * FROM users WHERE email = $1 and role = $2`, [email, role]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            const storedHashedPassword = user.password_hash;
            const validPassword = await bcrypt.compare(password, storedHashedPassword);
            if (!validPassword) {
                res.send("Password doesn't match");
            } else {
                req.session.user = {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                };
                setTimeout(() => {
                    res.redirect("/order");
                }, 3000);

            }
        } else {
            res.send("User not created or is not admin");
        }
    } catch (error) {
        res.send(error);
    }
});

app.post("/register", async (req, res) => {
    const name = req.body.name
    const email = req.body.username;
    const password = req.body.password;
    const role = req.body.role;
    const currentDate = new Date();
    try {
        // Check if user already exists
        const emailCheck = await db.query("SELECT * FROM users WHERE email = $1", [
            email,
        ]);
        if (emailCheck.rows.length > 0) {
            res.send("Email already exists. Try logging in.");
        } else {
            bcrypt.hash(password, saltRound, async (err, hashedPassword) => {
                if (err) {
                    console.log("Error hasing password:", err);
                    res.send("Something went wrong");
                } else {
                    const result = await db.query(
                        "INSERT INTO users (name, email, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, email",
                        [name, email, hashedPassword, role, currentDate]
                    );
                    const newUser = result.rows[0];
                    // Store user in session
                    req.session.user = {
                        id: newUser.id,
                        email: newUser.email,
                        name: newUser.name,
                        role: newUser.role
                    };
                    setTimeout(() => {
                        res.redirect("/order");
                    }, 3000);
                }
            });
        }
    } catch (error) {
        res.send("Error creating user");
    }
});



app.listen(port, (req, res) => {
    console.log(`Server is starting on port ${port}`);
});