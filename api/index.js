require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const dayjs = require("dayjs");

// Load environment variables
const { DB_USERNAME, DB_PASSWORD, DB_CLUSTER, DB_NAME } = process.env;

// Connect to MongoDB using environment variables
mongoose.connect(
  `mongodb+srv://${DB_USERNAME}:${DB_PASSWORD}@${DB_CLUSTER}/${DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`,
  { useNewUrlParser: true, useUnifiedTopology: true }
);

const db = mongoose.connection;
db.on("error", console.error.bind(console, "Connection error:"));
db.once("open", () => console.log("Connected to MongoDB"));

// Booking Schema
const bookingSchema = new mongoose.Schema({
  date: String,
  time: String,
  guests: Number,
  name: String,
  contact: String,
});

const Booking = mongoose.model("Booking", bookingSchema);

const app = express();
const PORT = 5000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Generate Time Slots
const generateTimeSlots = () => {
  const slots = [];
  for (let hour = 10; hour <= 20; hour++) {
    const time = `${String(hour).padStart(2, "0")}:00`;
    slots.push(time);
  }
  return slots;
};

const ALL_TIME_SLOTS = generateTimeSlots();

// Validate Booking Data
const validateBooking = ({ date, time, guests, name, contact }) => {
  if (!date || !time || !guests || !name || !contact) {
    return { valid: false, message: "All fields are required." };
  }
  if (isNaN(guests) || guests <= 0) {
    return { valid: false, message: "Guests must be a positive number." };
  }
  if (!ALL_TIME_SLOTS.includes(time)) {
    return { valid: false, message: "Invalid time slot selected." };
  }
  return { valid: true };
};

// Fetch Available Slots
app.get("/available-slots", async (req, res) => {
  const { date } = req.query;

  if (!date || !dayjs(date, "YYYY-MM-DD", true).isValid()) {
    return res
      .status(400)
      .json({ error: "Invalid date format. Use YYYY-MM-DD." });
  }

  try {
    const bookings = await Booking.find({ date });
    const bookedSlots = bookings.map((booking) => booking.time);

    const now = dayjs();

    // Generate available slots
    const availableSlots = ALL_TIME_SLOTS.filter((timeSlot) => {
      const slotTime = dayjs(`${date}T${timeSlot}`);
      return (
        !bookedSlots.includes(timeSlot) &&
        (date !== now.format("YYYY-MM-DD") || slotTime.isAfter(now))
      );
    });

    res.status(200).json({ availableSlots });
  } catch (error) {
    console.error("Error fetching available slots:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create Booking
app.post("/bookings", async (req, res) => {
  const { date, time, guests, name, contact } = req.body;

  const validation = validateBooking({ date, time, guests, name, contact });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  try {
    const isBooked = await Booking.findOne({ date, time });
    if (isBooked) {
      return res.status(400).json({ error: "Slot already booked." });
    }

    const newBooking = new Booking({ date, time, guests, name, contact });
    await newBooking.save();
    res
      .status(201)
      .json({ message: "Booking created successfully.", booking: newBooking });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update Booking
app.put("/bookings/:id", async (req, res) => {
  const { id } = req.params;
  const { date, time, guests, name, contact } = req.body;

  try {
    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { date, time, guests, name, contact },
      { new: true, runValidators: true }
    );

    if (!updatedBooking) {
      return res.status(404).json({ error: "Booking not found." });
    }

    res.status(200).json({
      message: "Booking updated successfully.",
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("Error updating booking:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete Booking
app.delete("/bookings/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await Booking.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({ error: "Booking not found." });
    }

    res.status(200).json({ message: "Booking deleted successfully." });
  } catch (error) {
    console.error("Error deleting booking:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Fetch Bookings
app.get("/bookings", async (req, res) => {
  const { date } = req.query;

  try {
    const bookings = date
      ? await Booking.find({ date }).sort({ time: 1 })
      : await Booking.find().sort({ date: 1, time: 1 });

    res.status(200).json(bookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);

module.exports = app;
