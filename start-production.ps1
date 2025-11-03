# Jirani Mwema Production Launch

echo "Starting Jirani Mwema Backend in Production Mode..."

# Kill any existing Node.js processes
taskkill /f /im node.exe 2>$null

# Wait a moment
Start-Sleep -Seconds 2

# Start the production server
cd "C:\Users\User\Desktop\final project\jirani-mwema-backend"
node src/app.js
