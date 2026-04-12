const db = require('../config/db');
const authController = require('../controllers/authController');

const testRegister = async () => {
    try {
        const req = {
            body: {
                name: 'Test Boss',
                email: 'testboss' + Date.now() + '@example.com',
                password: 'Password123!',
                companyName: 'Test Corp ' + Date.now(),
                selectedPlan: 'pro'
            },
            ip: '127.0.0.1',
            headers: { 'user-agent': 'test' }
        };
        const res = {
            status: function(s) { 
                this.statusCode = s; 
                console.log('STATUS:', s);
                return this; 
            },
            json: function(j) { console.log('JSON RESPONSE:', j); return this; }
        };
        
        await authController.register(req, res);
    } catch (e) {
        console.error('Fatal Catch:', e);
    } finally {
        process.exit();
    }
}
testRegister();
