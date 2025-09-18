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

let allUsers = [];
let categories = [];
let products = [];


//----------------------------------------GET ROUTES------------------------------------- //
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
    if (req.session.user) {
        res.render("screens/order.ejs")
    } else {
        res.redirect("/login");
    }

});

app.get("/category", async (req, res) => {
    if (req.session.user) {
        const result = await db.query("SELECT id, name, description, created_at FROM categories");
        if (result) {
            categories = result.rows;
            res.render("screens/category.ejs", {
                category: categories,
            });
        } else {
            console.log("something went wrong");
        }

    } else {
        res.redirect("/login");
    }

});

app.get("/product", async (req, res) => {
    if (req.session.user) {
        const result = await db.query(`SELECT p.id, p.name, p.description, p.price, p.stock, p.image_url, c.name as category,
	   p.created_at FROM products p JOIN categories c ON p.category_id = c.id;`);

        const categoryResult = await db.query("SELECT id, name FROM categories");

        products = result.rows;
        res.render("screens/product.ejs", {
            product: products,
            categories: categoryResult.rows
        });

    } else {
        res.redirect("/login");
    }

});

app.get("/customer", async (req, res) => {
    if (req.session.user) {
        const result = await db.query("SELECT id, name, email, role, created_at FROM users");
        if (result) {
            allUsers = result.rows;
            res.render("screens/customer.ejs", {
                allUser: allUsers,
            });
        } else {
            console.log("something went wrong");
        }

    } else {
        res.redirect("/login");
    }

});

app.get("/about", (req, res) => {
    res.render("screens/about.ejs");
});

app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect("/");
        } else {
            setTimeout(() => {
                res.clearCookie("connect.sid"); // Clear the session cookie
                res.redirect("/");
            }, 3000);
        }
    });

});

//----------------------- POST Routes-------------------------------//

// ------Login------- 
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

//--------Register---------
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


//--------- Add Category------------
app.post("/category", async (req, res) => {
    const name = req.body.name;
    const description = req.body.description;
    const currentDate = new Date();
    try {
        await db.query(
            "INSERT INTO categories (name, description, created_at) VALUES ($1, $2, $3)",
            [name, description, currentDate]
        );
        setTimeout(() => {
            res.redirect("/category");
        }, 3000);

    } catch (err) {
        console.error("Error inserting category:", err);
        res.send("Something went wrong");
    }
});

//-----------Add products------------
app.post("/product", async (req, res) => {
    const name = req.body.name;
    const description = req.body.description;
    const price = req.body.price;
    const stock = req.body.stock;
    const image = req.body.image;
    const category_name = req.body.categoryName;
    console.log("Category: ", category_name)
    const currentDate = new Date();
    try {
        const categoryResult = await db.query("SELECT id FROM categories WHERE name = $1 LIMIT 1", [category_name]);
        console.log(categoryResult);
        if (categoryResult.rows.length === 0) {
            return res.send("Category Not Found. Please create category first");
        }
        const category_id = categoryResult.rows[0].id;
        console.log(category_id);

        await db.query(
            "INSERT INTO products (name, description, price, stock, image_url, category_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [name, description, price, stock, image, category_id, currentDate]
        );
        setTimeout(() => {
            res.redirect("/product");
        }, 3000);

    } catch (err) {
        console.error("Error inserting category:", err);
        res.send("Something went wrong");
    }
});

//-------------Add Customer-----------//
app.post("/customer", async (req, res) => {
    const name = req.body.name
    const email = req.body.email;
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
                    setTimeout(() => {
                        res.redirect("/customer");
                    }, 3000);
                }
            });
        }
    } catch (error) {
        res.send("Error creating user");
    }
});






//----------------------DELETE ROUTE--------------------------//

//-------- DELETE USER-----------//
app.post("/customer/delete/:id", async (req, res) => {
    if (req.session.user) {
        const userId = req.params.id;
        try {
            await db.query("DELETE FROM users WHERE id = $1", [userId]);
            setTimeout(() => {
                res.redirect("/customer");
            }, 1000);
        } catch (err) {
            console.error("Error deleting user:", err);
            res.send("Error deleting user");
        }
    } else {
        res.render("/login");
    }
});

//-------- DELETE CATEGORY-----------//
app.post("/category/delete/:id", async (req, res) => {
    if (req.session.user) {
        const userId = req.params.id;
        try {
            await db.query("DELETE FROM categories WHERE id = $1", [userId]);
            setTimeout(() => {
                res.redirect("/category");
            }, 1000);
        } catch (err) {
            console.error("Error deleting category:", err);
            res.send("Error deleting category");
        }
    } else {
        res.render("/login");
    }
});


//-------- DELETE PRODUCT-----------//
app.post("/product/delete/:id", async (req, res) => {
    if (req.session.user) {
        const userId = req.params.id;
        try {
            await db.query("DELETE FROM products WHERE id = $1", [userId]);
            setTimeout(() => {
                res.redirect("/product");
            }, 1000);
        } catch (err) {
            console.error("Error deleting product:", err);
            res.send("Error deleting product");
        }
    } else {
        res.render("/login");
    }
});





//----------------------UPDATE ROUTE--------------------------//

//------------ UPDATE USER-----------//
app.post("/customer/edit/:id", async (req, res) => {
    if (req.session.user) {
        const userId = req.params.id;
        const { name, email, role } = req.body;
        try {
            await db.query(
                "UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4",
                [name, email, role, userId]
            );
            setTimeout(() => {
                res.redirect("/customer");
            }, 2000);

        } catch (err) {
            console.error("Error updating user:", err);
            res.send("Error updating user");
        }
    } else {
        res.redirect("/login");
    }
});

//------------ UPDATE CATEGORY-----------//
app.post("/category/edit/:id", async (req, res) => {
    if (req.session.user) {
        const userId = req.params.id;
        const { name, description} = req.body;
        try {
            await db.query(
                "UPDATE categories SET name = $1, description = $2 WHERE id = $3",
                [name, description, userId]
            );
            setTimeout(() => {
                res.redirect("/category");
            }, 2000);

        } catch (err) {
            console.error("Error updating category:", err);
            res.send("Error updating category");
        }
    } else {
        res.redirect("/login");
    }
});

//------------ UPDATE PRODUCT-----------//
app.post("/product/edit/:id", async (req, res) => {
    if (req.session.user) {
        const userId = req.params.id;
        const { name, description, price, stock, image} = req.body;
        try {
            await db.query(
                "UPDATE products SET name = $1, description = $2, price = $3, stock = $4, image_url = $5 WHERE id = $6",
                [name, description, price, stock, image, userId]
            );
            setTimeout(() => {
                res.redirect("/product");
            }, 2000);

        } catch (err) {
            console.error("Error updating product:", err);
            res.send("Error updating product");
        }
    } else {
        res.redirect("/login");
    }
});




//--------------LISTEN------------//
app.listen(port, () => {
    console.log(`Server is starting on port ${port}`);
});
