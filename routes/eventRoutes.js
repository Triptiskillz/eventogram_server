// src/routes/eventRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const path = require("path");
const upload = require("../db/multerForEvent");
const middleware = require("../middleware");
const fs = require("fs");
const paymentController = require("../controller/paymentController");

// Route to fetch events for the news feed
router.get("/feed", middleware.verifyToken, async (req, res) => {
  // const { eventType, location, date, sortBy } = req.query;

  try {
    const eventsQuery = await pool.query(
      `SELECT * FROM events WHERE is_public = true`
    );
    const eventMedia = await pool.query("SELECT * FROM event_media");

    const events = eventsQuery.rows;
    const image = eventMedia.rows;
    // Create a mapping from event IDs to media
    const mediaMap = new Map();
    image.forEach((media) => {
      const eventId = media.event_id;
      if (!mediaMap.has(eventId)) {
        mediaMap.set(eventId, []);
      }
      mediaMap.get(eventId).push(media);
    });

    // Update the events array with media information
    events.forEach((event) => {
      const eventId = event.id;
      if (mediaMap.has(eventId)) {
        event.media = mediaMap.get(eventId);
      } else {
        event.media = []; // No media for this event
      }
    });
    res.json({ events });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// Route to create a new event
router.post(
  "/create",
  middleware.verifyToken,
  upload.array("media", 10),
  async (req, res) => {
    const creatorId = req.userId;
    const { name, date, time, location, description, ticket_price, is_public } =
      req.body;

    try {
      const result = await pool.query(
        "INSERT INTO events (name, date, time, location, description, ticket_price, is_public, creator_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
        [
          name,
          date,
          time,
          location,
          description,
          ticket_price,
          is_public,
          creatorId,
        ]
      );

      const eventId = result.rows[0].id;

      // Save media (images and videos) to a storage service or database
      if (req.files && req.files.length > 0) {
        // Process and save each uploaded file
        req.files.forEach(async (file, index) => {
          const mediaType = file.mimetype.startsWith("image")
            ? "image"
            : "video";
          const mediaPath = `${mediaType}-${file.originalname}`;

          // Save media information in the database
          await pool.query(
            "INSERT INTO event_media (event_id, media_type, media_path) VALUES ($1, $2, $3)",
            [eventId, mediaType, mediaPath]
          );
        });
      }

      res.json({ message: "Event created successfully", eventId });
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  }
);

router.put(
  "/:eventId",
  middleware.verifyToken,
  upload.array("media", 10),
  async (req, res) => {
    const eventId = req.params.eventId;
    const userId = req.userId;
    const {
      name,
      date,
      time,
      location,
      description,
      ticket_price,
      is_public,
      status,
    } = req.body;

    try {
      // Check if the user is the creator of the event
      const eventCheck = await pool.query(
        "SELECT * FROM events WHERE id = $1 AND creator_id = $2",
        [eventId, userId]
      );

      if (eventCheck.rows.length === 0) {
        return res
          .status(403)
          .json({ error: "Unauthorized to update this event" });
      }

      // Update event details
      await pool.query(
        "UPDATE events SET name = $1, date = $2, time = $3, location = $4, description = $5, ticket_price = $6, is_public = $7, status = $8 WHERE id = $9",
        [
          name,
          date,
          time,
          location,
          description,
          ticket_price,
          is_public,
          status,
          eventId,
        ]
      );

      // Save updated media (images and videos) to the event_media table
      if (req.files && req.files.length > 0) {
        req.files.forEach(async (file, index) => {
          const mediaType = file.mimetype.startsWith("image")
            ? "image"
            : "video";
          const mediaPath = `${mediaType}-${file.originalname}`;

          await pool.query(
            "INSERT INTO event_media (event_id, media_type, media_path) VALUES ($1, $2, $3)",
            [eventId, mediaType, mediaPath]
          );
        });
      }

      res.json({ message: "Event updated successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  }
);

// Route to get event details and media
router.get("/:userId/:eventId", middleware.verifyToken, async (req, res) => {
  const eventId = req.params.eventId;
  const userId = req.userId;

  try {
    // Check if the user is the creator of the event
    const eventCheck = await pool.query(
      "SELECT * FROM events WHERE id = $1 AND creator_id = $2",
      [eventId, userId]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(403).json({ error: "Unauthorized to view this event" });
    }

    // Get event details
    const eventDetails = await pool.query(
      "SELECT * FROM events WHERE id = $1",
      [eventId]
    );

    // Get media associated with the event
    const eventMedia = await pool.query(
      "SELECT * FROM event_media WHERE event_id = $1",
      [eventId]
    );

    res.json({ event: eventDetails.rows[0], media: eventMedia.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// Route to delete an event
router.delete("/:eventId", middleware.verifyToken, async (req, res) => {
  const eventId = req.params.eventId;

  try {
    // Delete the event
    const deleteEventQuery = await pool.query(
      "DELETE FROM events WHERE id = $1 RETURNING *",
      [eventId]
    );

    const deletedEvent = deleteEventQuery.rows[0];

    if (!deletedEvent) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json({ message: "Event deleted successfully", event: deletedEvent });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// Route to delete event media
router.delete(
  "/:eventId/media/:mediaId",
  middleware.verifyToken,
  async (req, res) => {
    const eventId = req.params.eventId;
    const mediaId = req.params.mediaId;

    try {
      // Get the media path for the given media ID
      const mediaPathQuery = await pool.query(
        "SELECT media_path FROM event_media WHERE id = $1 AND event_id = $2",
        [mediaId, eventId]
      );

      if (mediaPathQuery.rows.length === 0) {
        return res.status(404).json({
          error: "Media not found for the specified event and media ID",
        });
      }

      const mediaPath = mediaPathQuery.rows[0].media_path;

      // Delete the media entry from the database
      await pool.query(
        "DELETE FROM event_media WHERE id = $1 AND event_id = $2",
        [mediaId, eventId]
      );

      // Delete the actual file from storage (assuming it's stored on the server)
      const filePath = path.join(__dirname, "../public", mediaPath);
      fs.unlinkSync(filePath);

      res.json({ message: "Event media deleted successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  }
);
// Route to purchase tickets for an event
router.post(
  "/:userId/:eventId/tickets",
  middleware.verifyToken,
  async (req, res) => {
    const userId = req.params.userId;
    const eventId = req.params.eventId;
    const { totalAmount, quantity } = req.body;

    try {
      // Fetch event details
      const eventQuery = await pool.query(
        "SELECT * FROM events WHERE id = $1",
        [eventId]
      );
      const event = eventQuery.rows[0];

      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Calculate total amount based on ticket price and quantity
      // const totalAmount = event.ticket_price * quantity;

      // Perform the payment (replace this with your payment gateway integration)
      // Assume the payment gateway returns a payment ID

      const paymentId = await paymentController.createPaymentIntent(
        totalAmount
      );

      // Record the payment in the database
      if (paymentId) {
        await pool.query(
          "INSERT INTO payments (user_id, event_id, amount) VALUES ($1, $2, $3) RETURNING *",
          [userId, eventId, totalAmount]
        );

        // Record the purchased tickets in the database
        await pool.query(
          "INSERT INTO tickets (user_id, event_id, payment_id, quantity) VALUES ($1, $2, $3, $4) RETURNING *",
          [userId, eventId, paymentId, quantity]
        );
        res.json({ message: "Tickets purchased successfully" });
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  }
);

// Route to fetch user's purchased tickets
router.get(
  "/users/:userId/tickets",
  middleware.verifyToken,
  async (req, res) => {
    const userId = req.params.userId;

    try {
      const client = await pool.connect();

      // Fetch user's purchased tickets
      const ticketsQuery = await client.query(
        "SELECT * FROM tickets WHERE user_id = $1",
        [userId]
      );
      const tickets = ticketsQuery.rows;

      res.json({ tickets });
      client.release();
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  }
);

// Route to cancel a ticket purchase and process a refund
router.delete(
  "/tickets/:ticketId",
  middleware.verifyToken,
  async (req, res) => {
    const userId = req.userId;
    const ticketId = req.params.ticketId;

    try {
      const client = await pool.connect();

      // Fetch ticket details
      const ticketQuery = await client.query(
        "SELECT * FROM tickets WHERE id = $1 AND user_id = $2",
        [ticketId, userId]
      );
      const ticket = ticketQuery.rows[0];

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Fetch payment details
      const paymentQuery = await client.query(
        "SELECT * FROM payments WHERE id = $1",
        [ticket.payment_id]
      );
      const payment = paymentQuery.rows[0];

      // Process refund (replace this with your refund logic)
      const refundStatus = await processRefund(payment);

      if (refundStatus === "success") {
        // Delete the ticket entry
        await client.query("DELETE FROM tickets WHERE id = $1", [ticketId]);

        res.json({
          message: "Ticket canceled and refund processed successfully",
        });
      } else {
        res.status(500).json({ error: "Failed to process refund" });
      }

      client.release();
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  }
);

module.exports = router;
