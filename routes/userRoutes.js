const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const middleware = require("../middleware");
const nodemailer = require("nodemailer");
const upload = require("../db/multer");
require("dotenv").config();
// User registration
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // const client = await pool.connect();

    const results = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (results.rows.length > 0) {
      res.json({ error: "Email already registered" });
    }

    const result = await pool.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *",
      [name, email, hashedPassword]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// User login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user.id);

    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/profile/:id", middleware.verifyToken, async (req, res) => {
  const userId = req.params.id;

  try {
    const result = await pool.query(
      "SELECT id, name, email,profile_picture FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userProfile = result.rows[0];
    res.json(userProfile);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});
router.put(
  "/profile/:id",
  middleware.verifyToken,
  upload.single("profilePicture"),
  async (req, res) => {
    const userId = req.params.id;
    const { name } = req.body;
    // console.log(req.file);
    try {
      // Update user's name
      if (name) {
        await pool.query("UPDATE users SET name = $1 WHERE id = $2", [
          name,
          userId,
        ]);
      }
      // Update user's profile picture if provided
      // console.log(req.file);

      if (req.file) {
        console.log(req.file);
        const image = req.file.filename;
        await pool.query(
          "UPDATE users SET profile_picture = $1 WHERE id = $2",
          [image, userId]
        );
      }

      res.json({ message: "Profile or Name updated successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  }
);
// Request password reset (generates and sends reset link)
router.post("/reset-password/request", async (req, res) => {
  const { email } = req.body;

  try {
    const result = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = result.rows[0].id;
    const resetToken = generateToken(userId);

    // Save reset token in the database (you may create a separate table for reset tokens)
    // For simplicity, let's assume you have a "reset_token" column in your "users" table
    await pool.query("UPDATE users SET reset_token = $1 WHERE id = $2", [
      resetToken,
      userId,
    ]);

    // Send reset link to the user's email
    sendResetEmail(email, resetToken);

    res.json({ message: "Reset link sent to your email" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// Reset password (update password based on the reset token)
router.post("/reset-password/:token", async (req, res) => {
  const resetToken = req.params.token;
  const { newPassword } = req.body;

  try {
    const result = await pool.query(
      "SELECT id FROM users WHERE reset_token = $1",
      [resetToken]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid or expired reset token" });
    }

    const userId = result.rows[0].id;
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password and clear the reset token
    await pool.query(
      "UPDATE users SET password = $1, reset_token = NULL WHERE id = $2",
      [hashedPassword, userId]
    );

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// Send reset email
function sendResetEmail(email, resetToken) {
  // Configure nodemailer to send emails
  const transporter = nodemailer.createTransport({
    // Configure your email provider here
    service: "gmail",
    auth: {
      user: process.env.USEREMAIL,
      pass: process.env.USERPASSWORD,
    },
  });

  // Define email content
  const mailOptions = {
    from: process.env.USEREMAIL,
    to: email,
    subject: "Password Reset",
    text: `Click the following link to reset your password: http://localhost:3000/reset-password/${resetToken}`,
  };

  // Send the email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
}

// Generate JWT token
function generateToken(userId) {
  return jwt.sign({ userId }, "eventtesting2024", { expiresIn: "1h" });
}

module.exports = router;
