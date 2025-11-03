# Jirani Mwema Backend

Backend API for the Jirani Mwema Chama management mobile application.

## Overview

This Node.js/Express backend provides REST API endpoints for managing a community savings group (Chama) with features including:

- OTP-based authentication
- Role-based access control (Chairperson, Secretary, Treasurer, Member)
- Transaction management (contributions, loans)
- SMS notifications via Africa's Talking
- Push notifications via Firebase
- Meeting scheduling
- Financial reporting

## Project Structure

```
src/
├── app.js                  # Express app entry point
├── config/                 # Configuration files
├── routes/                 # API route definitions
├── controllers/            # Business logic controllers
├── models/                 # MongoDB data models
├── services/               # External service integrations
├── middleware/             # Custom middleware
└── utils/                  # Utility functions
```

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure your environment variables
4. Start MongoDB service
5. Run the application:
   - Development: `npm run dev`
   - Production: `npm start`

## API Endpoints

### Authentication
- `POST /api/auth/login` - Phone number login
- `POST /api/auth/verify-otp` - OTP verification
- `POST /api/auth/logout` - User logout

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/members` - List all members (admin only)

### Transactions
- `POST /api/transactions/contribution` - Record contribution
- `POST /api/transactions/loan` - Process loan request
- `GET /api/transactions/history` - Transaction history

### Notifications
- `POST /api/notifications/sms` - Send SMS notification
- `POST /api/notifications/push` - Send push notification

## Environment Variables

See `.env.example` for required environment variables.

## Technologies

- Node.js & Express
- MongoDB with Mongoose
- JWT for authentication
- Africa's Talking for SMS
- Firebase for push notifications
- bcryptjs for password hashing

## License

MIT License