# Admin Access Troubleshooting Guide

## Issue: Access Denied When Creating Users

### Possible Causes & Solutions:

## 1. User Role Issue
**Problem**: Your user doesn't have 'admin' role
**Solution**: 
```bash
# Check your user role
node check-user-role.js

# Promote your user to admin
node promote-to-admin.js +254746170866  # Replace with your phone number
```

## 2. Authentication Token Issue
**Problem**: Invalid or expired JWT token
**Solution**: 
- Log out and log back in to get a fresh token
- Check that the token is being sent correctly in the Authorization header

## 3. Backend Route Issue
**Problem**: Missing or incorrect API endpoint
**Solution**: ✅ **FIXED** - Added POST /api/admin/users endpoint

## 4. Network/Deployment Issue
**Problem**: Backend changes not deployed
**Solution**: ✅ **FIXED** - Changes pushed to Railway

## 5. Database Connection Issue
**Problem**: Can't connect to MongoDB to verify roles
**Solution**: Check internet connection and MongoDB Atlas access

## Testing the Fix:

1. **Restart the Flutter app** to get the latest backend changes
2. **Clear app cache** if necessary
3. **Login again** to ensure fresh token
4. **Try creating a user** in the admin panel

## Backend Changes Made:

✅ Added `createUser` function in `adminController.js`
✅ Added `POST /api/admin/users` route in `adminRoutes.js`
✅ Fixed `AdminService.createUser` to use correct endpoint
✅ Deployed changes to Railway

## Debug Steps:

1. Check network tab in Flutter app to see exact error response
2. Look at Railway logs to see if request reaches backend
3. Verify user role in database
4. Check JWT token validity

## Admin User Creation Endpoint:

```
POST /api/admin/users
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe", 
  "phoneNumber": "+254712345678",
  "nationalId": "12345678",
  "role": "member"
}
```

Valid roles: member, secretary, treasurer, chairperson