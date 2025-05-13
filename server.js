const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// MongoDB Atlas connection
mongoose
  .connect("mongodb+srv://ashvanth:23BIT0366@cluster0.n5j28rn.mongodb.net/", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Atlas connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Schemas
const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
}));

const Booking = mongoose.model("Booking", new mongoose.Schema({
  from: String,
  to: String,
  date: String,
  passengers: Number,
  seatType: String,
  email: String,
  passengerDetails: Array,
}));

const BookedSeat = mongoose.model("BookedSeat", new mongoose.Schema({
  seatNumber: String,
  busId: String,
  date: String,
  bookedAt: { type: Date, default: Date.now, expires: '30d' },
}));

const Contact = mongoose.model("Contact", new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  date: { type: Date, default: Date.now },
}));

// Routes
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) return res.status(400).json({ error: "Username or email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await new User({ username, email, password: hashedPassword }).save();
    res.json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ error: "Invalid credentials" });

    res.json({ message: "Login successful" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/book", async (req, res) => {
  try {
    const bookingData = new Booking(req.body);
    await bookingData.save();
    res.status(201).json({ message: "Passenger details stored", booking: bookingData });
  } catch (error) {
    res.status(500).json({ message: "Error saving booking", error });
  }
});

app.get("/booked-seats", async (req, res) => {
  const { busId, date } = req.query;
  const booked = await BookedSeat.find({ busId, date });
  res.json({ bookedSeats: booked.map(s => s.seatNumber) });
});

app.post("/book-seat", async (req, res) => {
  const { busId, date, seats, email } = req.body;
  if (!busId || !date || !seats || !email)
    return res.status(400).json({ message: "Missing required fields." });

  try {
    const existing = await BookedSeat.find({ busId, date, seatNumber: { $in: seats.map(String) } });
    if (existing.length > 0) return res.status(400).json({ message: "Some seats already booked." });

    await BookedSeat.insertMany(seats.map(seat => ({ busId, date, seatNumber: seat.toString() })));

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "ashvanth932006@gmail.com",
        pass: "kotn dnou gigp ttus", // Use App Password
      },
    });

    await transporter.sendMail({
      from: "ashvanth932006@gmail.com",
      to: email,
      subject: "Booking Confirmation ✔",
      html: `
        <div>
          <h2 style="color:#0ef;">Booking Confirmed</h2>
          <p><strong>Bus ID:</strong> ${busId}</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Seats:</strong> ${seats.join(", ")}</p>
          <br/><p>Thank you for booking with us!</p>
        </div>`,
    });

    res.json({ message: "Seats booked and confirmation email sent!" });
  } catch (err) {
    console.error("Booking error:", err);
    res.status(500).json({ message: "Booking failed. Try again later." });
  }
});

app.post("/cancel-seat", async (req, res) => {
  const { busId, seatNo, date, email } = req.body;

  try {
    const deleted = await BookedSeat.findOneAndDelete({ busId, date, seatNumber: seatNo });
    if (!deleted) return res.status(404).json({ message: "Ticket not found." });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "ashvanth932006@gmail.com",
        pass: "kotn dnou gigp ttus", // App Password
      },
    });

    await transporter.sendMail({
      from: "ashvanth932006@gmail.com",
      to: email,
      subject: "Ticket Cancellation Confirmation",
      html: `
        <div>
          <h2 style="color:red;">Ticket Cancelled</h2>
          <p><strong>Bus ID:</strong> ${busId}</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Cancelled Seat Number:</strong> ${seatNo}</p>
        </div>`,
    });

    res.json({ message: "Ticket cancelled and email sent!" });
  } catch (error) {
    console.error("Cancellation error:", error);
    res.status(500).json({ message: "Error cancelling ticket." });
  }
});

app.post('/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    await new Contact({ name, email, message }).save();
    res.status(200).json({ success: true, message: "Message sent successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get('/get-latest-ticket', async (req, res) => {
  try {
    const latestBooking = await Booking.findOne().sort({ _id: -1 });
    const latestSeat = await BookedSeat.findOne().sort({ _id: -1 });

    if (!latestBooking || !latestSeat) return res.status(404).json({ message: 'No booking found' });

    const passenger = latestBooking.passengerDetails.at(-1);
    res.json({
      name: passenger.name,
      age: passenger.age,
      sex: passenger.sex,
      email: latestBooking.email,
      date: latestBooking.date,
      from: latestBooking.from,
      to: latestBooking.to,
      seatType: latestBooking.seatType,
      busId: latestSeat.busId,
      seatNo: latestSeat.seatNumber,
      price: "850"
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load ticket' });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "sign in.html"));
});

app.listen(500, () => console.log("Server running on http://localhost:500"));
