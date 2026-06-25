# trrip ✈️

A MERN-based web application that lets users upload travel booking documents and automatically generates a smart, AI-powered itinerary.

---

## What it does

Upload your flight tickets, hotel bookings, or travel documents (PDF/image), and trrip extracts the key details and generates a structured itinerary — all in one place.

---

## Features

- 🔐 **JWT Authentication** — Secure login and registration
- 📄 **Document Upload** — Supports PDFs and images (flight tickets, hotel bookings, etc.)
- 🤖 **AI Itinerary Generation** — Uses OpenAI/Gemini to extract data and generate a travel plan
- 🗂️ **Itinerary History** — View all previously generated itineraries when logged in
- 🔗 **Shareable Itineraries** — Share your travel plan with others

---

## Tech Stack

| Layer     | Technology              |
|-----------|-------------------------|
| Frontend  | React.js                |
| Backend   | Node.js + Express.js    |
| Database  | MongoDB                 |
| Auth      | JWT                     |
| AI        | OpenAI / Gemini API     |

---

## Getting Started

### Prerequisites
- Node.js v18+
- MongoDB (local or Atlas)
- OpenAI or Gemini API key

### Installation

```bash
# Clone the repo
git clone https://github.com/your-username/trrip.git
cd trrip

# Install backend dependencies
cd server && npm install

# Install frontend dependencies
cd ../client && npm install
```

### Environment Variables

Create a `.env` file in `/server`:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
AI_API_KEY=your_openai_or_gemini_key
```

### Run the App

```bash
# Start backend
cd server && npm run dev

# Start frontend
cd client && npm start
```

App runs at `http://localhost:3000`

---

## Folder Structure

```
trrip/
├── client/          # React frontend
│   └── src/
│       ├── components/
│       ├── pages/
│       └── services/
└── server/          # Express backend
    ├── controllers/
    ├── models/
    ├── routes/
    └── middleware/
```

---

## License

MIT
