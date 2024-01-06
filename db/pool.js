const { Client } = require("pg");
require("dotenv").config();
const pool = new Client({
  user: process.env.USER,
  host: process.env.HOST,
  database: process.env.DATABASE,
  password: process.env.PASSWORD,
  port: process.env.DBPORT,
});

module.exports = pool;
