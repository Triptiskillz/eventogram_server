const multer = require("multer");
const path = require("path");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public"); // Specify the destination folder
  },
  filename: (req, file, cb) => {
    const mediaType = file.mimetype.startsWith("image") ? "image" : "video";
    cb(null, `${mediaType}-${file.originalname}`);
  },
});

const upload = multer({ storage });
module.exports = upload;
