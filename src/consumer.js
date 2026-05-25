import amqp from 'amqplib';
import nodemailer from 'nodemailer';
import pool from './db/pool.js';
import 'dotenv/config';

const initConsumer = async () => {
  try {
    const host = process.env.RABBITMQ_HOST || 'localhost';
    const port = process.env.RABBITMQ_PORT || 5672;
    const user = process.env.RABBITMQ_USER || 'guest';
    const pass = process.env.RABBITMQ_PASSWORD || 'guest';
    
    const connection = await amqp.connect(`amqp://${user}:${pass}@${host}:${port}`);
    const channel = await connection.createChannel();
    
    const queue = 'job_applications';
    await channel.assertQueue(queue, { durable: true });
    
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD }
    });

    console.log('RabbitMQ Consumer berjalan dan siap menerima pesan...');

    channel.consume(queue, async (msg) => {
      if (msg !== null) {
        try {
          const { application_id } = JSON.parse(msg.content.toString());
          
          // Query mencari data pelamar dan email PEMILIK pekerjaan (Job Owner)
          const query = `
            SELECT a.created_at, u_app.name as applicant_name, u_app.email as applicant_email,
                   u_owner.email as owner_email, j.title as job_title
            FROM applications a
            JOIN users u_app ON a.user_id = u_app.id
            JOIN jobs j ON a.job_id = j.id
            JOIN companies c ON j.company_id = c.id
            JOIN users u_owner ON c.user_id = u_owner.id
            WHERE a.id = $1
          `;
          const res = await pool.query(query, [application_id]);
          
          if (res.rowCount > 0) {
            const data = res.rows[0];
            const mailOptions = {
              from: '"OpenJob System" <no-reply@openjob.com>',
              to: data.owner_email,
              subject: `Kandidat Baru untuk Posisi ${data.job_title}`,
              text: `Halo, ada pelamar baru!\n\nNama: ${data.applicant_name}\nEmail: ${data.applicant_email}\nTanggal Melamar: ${data.created_at}`
            };
            await transporter.sendMail(mailOptions);
          }
          channel.ack(msg); // Tandai pesan selesai diproses
        } catch (error) {
          console.error(error);
          channel.ack(msg);
        }
      }
    });
  } catch (error) {
    console.error('Consumer gagal berjalan:', error);
  }
};

export default initConsumer;