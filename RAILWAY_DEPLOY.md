# Jirani Mwema Backend - Railway Deployment

## Quick Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template-id)

## Environment Variables Required

After deploying to Railway, add these environment variables in your Railway dashboard:

### Essential Variables
```
NODE_ENV=production
MONGODB_URI=mongodb+srv://silvano44:2Fel715Bj0uKKFb0@cluster0.eic8cdj.mongodb.net/?appName=Cluster0
JWT_SECRET=2414ff0ef94eed68071f171918e514cd
JWT_EXPIRES_IN=24h
AT_API_KEY=atsk_78396138c7a247a64c44f0db77eea3c50e7fd0f07ad23449368d163e5b45af0485b5dac1
AT_USERNAME=Jiranimwema254
AT_SENDER_ID=AFRICASTKNG
ENABLE_REAL_SMS=true
APP_NAME=Jirani Mwema
CHAMA_NAME=Jirani Mwema Chama
BCRYPT_ROUNDS=12
OTP_EXPIRY_MINUTES=10
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Deployment Steps

1. **Create Railway Account**: Go to [railway.app](https://railway.app) and sign up
2. **Connect GitHub**: Link your GitHub account to Railway
3. **Deploy Project**: 
   - Create new project from GitHub repo
   - Select your backend repository
   - Railway will auto-detect Node.js and deploy
4. **Add Environment Variables**: Copy variables from above into Railway dashboard
5. **Deploy**: Railway will automatically deploy your app

## Features Included

✅ Production-ready Express.js server
✅ MongoDB Atlas database connection
✅ Africa's Talking SMS service
✅ JWT authentication
✅ Rate limiting and security
✅ Health check endpoint
✅ Error handling

## API Endpoints

- **Health Check**: `GET /health`
- **Authentication**: `POST /api/auth/login`, `POST /api/auth/register`
- **Users**: `GET /api/users/profile`
- **Transactions**: `GET /api/transactions`
- **Meetings**: `GET /api/meetings`
- **Notifications**: `POST /api/notifications/send`

## Your Railway App URL

After deployment, your backend will be available at:
`https://your-app-name.up.railway.app`

Update your mobile app's API endpoints to use this URL instead of localhost.