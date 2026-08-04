const {app} = require('electron');
app.whenReady().then(async () => {
  try {
    const {SerialPort} = require('../openblock-link/node_modules/serialport');
    const ports = await SerialPort.list();
    console.log('PORTS', JSON.stringify(ports.map(p => ({path: p.path, vendorId: p.vendorId, productId: p.productId}))));
  } catch (e) {
    console.error('SERIAL_FAIL', e && e.stack || e);
  } finally {
    app.quit();
  }
});
