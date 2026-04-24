const reconcile = require('./dbReconciliation');
reconcile(10, 5000).then(() => {
    console.log('DONE');
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
