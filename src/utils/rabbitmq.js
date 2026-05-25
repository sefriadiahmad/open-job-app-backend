import amqp from 'amqplib';

const publishToQueue = async (queue, message) => {
  const host = process.env.RABBITMQ_HOST || 'localhost';
  const port = process.env.RABBITMQ_PORT || 5672;
  const user = process.env.RABBITMQ_USER || 'guest';
  const pass = process.env.RABBITMQ_PASSWORD || 'guest';
  
  const connection = await amqp.connect(`amqp://${user}:${pass}@${host}:${port}`);
  const channel = await connection.createChannel();
  
  await channel.assertQueue(queue, { durable: true });
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
  
  setTimeout(() => { connection.close(); }, 500); // Tutup koneksi setelah mengirim
};

export default publishToQueue;