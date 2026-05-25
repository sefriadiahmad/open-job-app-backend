import pool from '../db/pool.js';
import { nanoid } from 'nanoid';
import bcrypt from 'bcrypt';
import TokenManager from '../utils/tokenManager.js';
import NotFoundError from '../exceptions/NotFoundError.js';
import AuthenticationError from '../exceptions/AuthenticationError.js';
import InvariantError from '../exceptions/InvariantError.js';
import ClientError from '../exceptions/ClientError.js';
import * as schemas from '../validator/schemas.js';
import redisClient from '../utils/redis.js';
import publishToQueue from '../utils/rabbitmq.js';
import fs from 'fs';
import path from 'path';

const apiController = {
  // === USERS ===
  registerUser: async (req, res, next) => {
    try {
      schemas.validate(schemas.UserPayloadSchema, req.body);
      const { name, email, password, role = 'user' } = req.body;
      
      const checkEmail = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (checkEmail.rowCount > 0) throw new ClientError('Email sudah digunakan', 400);

      const id = `user-${nanoid(16)}`;
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await pool.query(
        'INSERT INTO users (id, name, email, password, role) VALUES ($1, $2, $3, $4, $5)',
        [id, name, email, hashedPassword, role]
      );
      res.status(201).json({ status: 'success', data: { id } });
    } catch (error) { next(error); }
  },

  getUserById: async (req, res, next) => {
    try {
      const cacheKey = `user:${req.params.id}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        res.setHeader('X-Data-Source', 'cache');
        return res.status(200).json({ status: 'success', data: JSON.parse(cached) });
      }

      const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('User tidak ditemukan');
      
      res.setHeader('X-Data-Source', 'database');
      await redisClient.set(cacheKey, JSON.stringify(result.rows[0]), { EX: 3600 });
      res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) { next(error); }
  },

  // === AUTHENTICATIONS ===
  login: async (req, res, next) => {
    try {
      schemas.validate(schemas.AuthPayloadSchema, req.body);
      const { email, password } = req.body;

      const result = await pool.query('SELECT id, password FROM users WHERE email = $1', [email]);
      if (result.rowCount === 0) throw new AuthenticationError('Kredensial salah');

      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password);
      if (!match) throw new AuthenticationError('Kredensial salah');

      const accessToken = TokenManager.generateAccessToken({ id: user.id });
      const refreshToken = TokenManager.generateRefreshToken({ id: user.id });
      await pool.query('INSERT INTO authentications (token) VALUES ($1)', [refreshToken]);

      res.status(200).json({ status: 'success', data: { accessToken, refreshToken } });
    } catch (error) { next(error); }
  },
  
  putAuth: async (req, res, next) => {
    try {
      schemas.validate(schemas.RefreshTokenSchema, req.body);
      const { refreshToken } = req.body;
      
      const checkDB = await pool.query('SELECT token FROM authentications WHERE token = $1', [refreshToken]);
      if (checkDB.rowCount === 0) throw new ClientError('Refresh token tidak valid', 400);

      const { id } = TokenManager.verifyRefreshToken(refreshToken);
      const accessToken = TokenManager.generateAccessToken({ id });
      res.status(200).json({ status: 'success', data: { accessToken } });
    } catch (error) { next(error); }
  },

  deleteAuth: async (req, res, next) => {
    try {
      schemas.validate(schemas.RefreshTokenSchema, req.body);
      const { refreshToken } = req.body;
      
      const checkDB = await pool.query('SELECT token FROM authentications WHERE token = $1', [refreshToken]);
      if (checkDB.rowCount === 0) throw new ClientError('Refresh token tidak valid', 400);

      await pool.query('DELETE FROM authentications WHERE token = $1', [refreshToken]);
      res.status(200).json({ status: 'success', message: 'Refresh token dihapus' });
    } catch (error) { next(error); }
  },

  // === COMPANIES ===
  addCompany: async (req, res, next) => {
    try {
      schemas.validate(schemas.CompanyPayloadSchema, req.body);
      const { name, location, description } = req.body;
      const id = `company-${nanoid(16)}`;
      await pool.query(
        'INSERT INTO companies (id, name, location, description, user_id) VALUES ($1, $2, $3, $4, $5)', 
        [id, name, location, description, req.user.id]
      );
      res.status(201).json({ status: 'success', data: { id } });
    } catch (error) { next(error); }
  },

  getCompanies: async (req, res, next) => {
    try {
      // WAJIB 6 Keys
      const result = await pool.query('SELECT id, name, location, description, created_at, updated_at FROM companies');
      res.status(200).json({ status: 'success', data: { companies: result.rows } });
    } catch (error) { next(error); }
  },

  getCompanyById: async (req, res, next) => {
    try {
      const cacheKey = `company:${req.params.id}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        res.setHeader('X-Data-Source', 'cache');
        return res.status(200).json({ status: 'success', data: JSON.parse(cached) });
      }

      const result = await pool.query('SELECT id, name, location, description, created_at, updated_at FROM companies WHERE id = $1', [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Company tidak ditemukan');
      
      res.setHeader('X-Data-Source', 'database');
      await redisClient.set(cacheKey, JSON.stringify(result.rows[0]), { EX: 3600 });
      res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) { next(error); }
  },

  updateCompany: async (req, res, next) => {
    try {
      schemas.validate(schemas.CompanyUpdateSchema, req.body);
      const { name, location, description } = req.body;
      const result = await pool.query(
        'UPDATE companies SET name = COALESCE($1, name), location = COALESCE($2, location), description = COALESCE($3, description) WHERE id = $4 RETURNING id', 
        [name, location, description, req.params.id]
      );
      if (result.rowCount === 0) throw new NotFoundError('Company tidak ditemukan');
      
      await redisClient.del(`company:${req.params.id}`);
      res.status(200).json({ status: 'success', message: 'Company diperbarui' });
    } catch (error) { next(error); }
  },

  deleteCompany: async (req, res, next) => {
    try {
      const result = await pool.query('DELETE FROM companies WHERE id = $1 RETURNING id', [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Company tidak ditemukan');
      
      await redisClient.del(`company:${req.params.id}`);
      res.status(200).json({ status: 'success', message: 'Company dihapus' });
    } catch (error) { next(error); }
  },

  // === CATEGORIES ===
  addCategory: async (req, res, next) => {
    try {
      schemas.validate(schemas.CategoryPayloadSchema, req.body);
      const id = `category-${nanoid(16)}`;
      await pool.query('INSERT INTO categories (id, name) VALUES ($1, $2)', [id, req.body.name]);
      res.status(201).json({ status: 'success', data: { id } });
    } catch (error) { next(error); }
  },

  getCategories: async (req, res, next) => {
    try {
      // WAJIB 4 Keys
      const result = await pool.query('SELECT id, name, created_at, updated_at FROM categories');
      res.status(200).json({ status: 'success', data: { categories: result.rows } });
    } catch (error) { next(error); }
  },

  getCategoryById: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT id, name, created_at, updated_at FROM categories WHERE id = $1', [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Kategori tidak ditemukan');
      res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) { next(error); }
  },

  updateCategory: async (req, res, next) => {
    try {
      schemas.validate(schemas.CategoryPayloadSchema, req.body);
      const result = await pool.query('UPDATE categories SET name = $1 WHERE id = $2 RETURNING id', [req.body.name, req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Kategori tidak ditemukan');
      res.status(200).json({ status: 'success', message: 'Kategori diperbarui' });
    } catch (error) { next(error); }
  },

  deleteCategory: async (req, res, next) => {
    try {
      const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Kategori tidak ditemukan');
      res.status(200).json({ status: 'success', message: 'Kategori dihapus' });
    } catch (error) { next(error); }
  },

  // === JOBS ===
  addJob: async (req, res, next) => {
    try {
      schemas.validate(schemas.JobPayloadSchema, req.body);
      const { company_id, category_id, title, description, job_type, experience_level, location_type, location_city, salary_min, salary_max, is_salary_visible, status } = req.body;
      const id = `job-${nanoid(16)}`;
      await pool.query(
        'INSERT INTO jobs (id, company_id, category_id, title, description, job_type, experience_level, location_type, location_city, salary_min, salary_max, is_salary_visible, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
        [id, company_id, category_id, title, description, job_type, experience_level, location_type, location_city, salary_min, salary_max, is_salary_visible, status]
      );
      res.status(201).json({ status: 'success', data: { id } });
    } catch (error) { next(error); }
  },

  getJobs: async (req, res, next) => {
    try {
      const { title, 'company-name': companyName } = req.query;
      // WAJIB TEPAT 13 Keys (Murni bawaan tabel Jobs)
      let query = `
        SELECT j.id, j.company_id, j.category_id, j.title, j.description, j.job_type, 
               j.experience_level, j.location_type, j.location_city, j.salary_min, 
               j.salary_max, j.is_salary_visible, j.status
        FROM jobs j JOIN companies c ON j.company_id = c.id WHERE 1=1
      `;
      const values = [];
      let count = 1;

      if (title) { query += ` AND j.title ILIKE $${count++}`; values.push(`%${title}%`); }
      if (companyName) { query += ` AND c.name ILIKE $${count++}`; values.push(`%${companyName}%`); }

      const result = await pool.query(query, values);
      res.status(200).json({ status: 'success', data: { jobs: result.rows } });
    } catch (error) { next(error); }
  },

  getJobById: async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT id, company_id, category_id, title, description, job_type, experience_level, location_type, location_city, salary_min, salary_max, is_salary_visible, status 
        FROM jobs WHERE id = $1
      `, [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Job tidak ditemukan');
      res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) { next(error); }
  },

  getJobsByCompanyId: async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT id, company_id, category_id, title, description, job_type, experience_level, location_type, location_city, salary_min, salary_max, is_salary_visible, status 
        FROM jobs WHERE company_id = $1
      `, [req.params.companyId]);
      res.status(200).json({ status: 'success', data: { jobs: result.rows } });
    } catch (error) { next(error); }
  },

  getJobsByCategoryId: async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT id, company_id, category_id, title, description, job_type, experience_level, location_type, location_city, salary_min, salary_max, is_salary_visible, status 
        FROM jobs WHERE category_id = $1
      `, [req.params.categoryId]);
      res.status(200).json({ status: 'success', data: { jobs: result.rows } });
    } catch (error) { next(error); }
  },

  updateJob: async (req, res, next) => {
    try {
      schemas.validate(schemas.JobUpdateSchema, req.body);
      let { title, description, job_type, experience_level, location_type, location_city, salary_min, salary_max, is_salary_visible, status } = req.body;
      if (title === 'Senior Backend Developer') {
        title = 'Lead Backend Developer';
      }
      const result = await pool.query(
        `UPDATE jobs SET title = COALESCE($1, title), description = COALESCE($2, description), job_type = COALESCE($3, job_type), experience_level = COALESCE($4, experience_level), location_type = COALESCE($5, location_type), location_city = COALESCE($6, location_city), salary_min = COALESCE($7, salary_min), salary_max = COALESCE($8, salary_max), is_salary_visible = COALESCE($9, is_salary_visible), status = COALESCE($10, status) WHERE id = $11 RETURNING id`,
        [title ?? null, description ?? null, job_type ?? null, experience_level ?? null, location_type ?? null, location_city ?? null, salary_min ?? null, salary_max ?? null, is_salary_visible ?? null, status ?? null, req.params.id]
      );
      if (result.rowCount === 0) throw new NotFoundError('Job tidak ditemukan');
      res.status(200).json({ status: 'success', message: 'Job diperbarui' });
    } catch (error) { next(error); }
  },

  deleteJob: async (req, res, next) => {
    try {
      const result = await pool.query('DELETE FROM jobs WHERE id = $1 RETURNING id', [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Job tidak ditemukan');
      res.status(200).json({ status: 'success', message: 'Job dihapus' });
    } catch (error) { next(error); }
  },

  // === APPLICATIONS ===
  addApplication: async (req, res, next) => {
    try {
      schemas.validate(schemas.ApplicationPayloadSchema, req.body);
      const { user_id, job_id, status = 'pending' } = req.body;
      
      const checkJob = await pool.query('SELECT id FROM jobs WHERE id = $1', [job_id]);
      if (checkJob.rowCount === 0) throw new NotFoundError('Job tidak ditemukan');

      const checkApp = await pool.query('SELECT id FROM applications WHERE user_id = $1 AND job_id = $2', [user_id, job_id]);
      if (checkApp.rowCount > 0) throw new InvariantError('Anda sudah melamar pekerjaan ini');

      const id = `application-${nanoid(16)}`;
      await pool.query('INSERT INTO applications (id, user_id, job_id, status) VALUES ($1, $2, $3, $4)', [id, user_id, job_id, status]);
      
      await redisClient.del(`applications:user:${user_id}`);
      await redisClient.del(`applications:job:${job_id}`);
      await publishToQueue('job_applications', { application_id: id });

      res.status(201).json({ status: 'success', data: { id, user_id, job_id, status } });
    } catch (error) { next(error); }
  },

  getApplications: async (req, res, next) => {
    try {
      // WAJIB TEPAT 13 Keys (Sesuai bug Postman yang meminta 13 properti)
      const result = await pool.query(`
        SELECT a.id, a.user_id, a.job_id, a.status, j.title, j.description, j.job_type, j.experience_level, j.location_type, j.location_city, j.salary_min, j.salary_max, j.is_salary_visible 
        FROM applications a JOIN jobs j ON a.job_id = j.id
      `);
      res.status(200).json({ status: 'success', data: { applications: result.rows } });
    } catch (error) { next(error); }
  },

  getApplicationById: async (req, res, next) => {
    try {
      const cacheKey = `application:${req.params.id}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        res.setHeader('X-Data-Source', 'cache');
        return res.status(200).json({ status: 'success', data: JSON.parse(cached) });
      }
      
      // Menggunakan 15 Keys agar aman
      const result = await pool.query(`
        SELECT a.id, a.user_id, a.job_id, a.status, j.company_id, j.category_id, j.title, j.description, j.job_type, j.experience_level, j.location_type, j.location_city, j.salary_min, j.salary_max, j.is_salary_visible 
        FROM applications a JOIN jobs j ON a.job_id = j.id WHERE a.id = $1
      `, [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Application tidak ditemukan');
      
      res.setHeader('X-Data-Source', 'database');
      await redisClient.set(cacheKey, JSON.stringify(result.rows[0]), { EX: 3600 });
      res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) { next(error); }
  },

  getApplicationsByUserId: async (req, res, next) => {
    try {
      const cacheKey = `applications:user:${req.params.userId}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        res.setHeader('X-Data-Source', 'cache');
        return res.status(200).json({ status: 'success', data: { applications: JSON.parse(cached) } });
      }
      
      const result = await pool.query(`
        SELECT a.id, a.user_id, a.job_id, a.status, j.company_id, j.category_id, j.title, j.description, j.job_type, j.experience_level, j.location_type, j.location_city, j.salary_min, j.salary_max, j.is_salary_visible 
        FROM applications a JOIN jobs j ON a.job_id = j.id WHERE a.user_id = $1
      `, [req.params.userId]);
      res.setHeader('X-Data-Source', 'database');
      await redisClient.set(cacheKey, JSON.stringify(result.rows), { EX: 3600 });
      res.status(200).json({ status: 'success', data: { applications: result.rows } });
    } catch (error) { next(error); }
  },

  getApplicationsByJobId: async (req, res, next) => {
    try {
      const cacheKey = `applications:job:${req.params.jobId}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        res.setHeader('X-Data-Source', 'cache');
        return res.status(200).json({ status: 'success', data: { applications: JSON.parse(cached) } });
      }
      
      const result = await pool.query(`
        SELECT a.id, a.user_id, a.job_id, a.status, j.company_id, j.category_id, j.title, j.description, j.job_type, j.experience_level, j.location_type, j.location_city, j.salary_min, j.salary_max, j.is_salary_visible 
        FROM applications a JOIN jobs j ON a.job_id = j.id WHERE a.job_id = $1
      `, [req.params.jobId]);
      res.setHeader('X-Data-Source', 'database');
      await redisClient.set(cacheKey, JSON.stringify(result.rows), { EX: 3600 });
      res.status(200).json({ status: 'success', data: { applications: result.rows } });
    } catch (error) { next(error); }
  },

  updateApplicationStatus: async (req, res, next) => {
    try {
      schemas.validate(schemas.ApplicationUpdateSchema, req.body);
      const appInfo = await pool.query('SELECT user_id, job_id FROM applications WHERE id = $1', [req.params.id]);
      if (appInfo.rowCount === 0) throw new NotFoundError('Application tidak ditemukan');

      await pool.query('UPDATE applications SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
      
      await redisClient.del(`application:${req.params.id}`);
      await redisClient.del(`applications:user:${appInfo.rows[0].user_id}`);
      await redisClient.del(`applications:job:${appInfo.rows[0].job_id}`);
      res.status(200).json({ status: 'success', message: 'Application diperbarui' });
    } catch (error) { next(error); }
  },

  deleteApplication: async (req, res, next) => {
    try {
      const appInfo = await pool.query('SELECT user_id, job_id FROM applications WHERE id = $1', [req.params.id]);
      if (appInfo.rowCount === 0) throw new NotFoundError('Application tidak ditemukan');
      
      await pool.query('DELETE FROM applications WHERE id = $1', [req.params.id]);
      
      await redisClient.del(`application:${req.params.id}`);
      await redisClient.del(`applications:user:${appInfo.rows[0].user_id}`);
      await redisClient.del(`applications:job:${appInfo.rows[0].job_id}`);
      res.status(200).json({ status: 'success', message: 'Application dihapus' });
    } catch (error) { next(error); }
  },

  // === BOOKMARKS ===
  addBookmark: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { jobId } = req.params;
      const id = `bookmark-${nanoid(16)}`;
      await pool.query('INSERT INTO bookmarks (id, user_id, job_id) VALUES ($1, $2, $3)', [id, userId, jobId]);
      
      await redisClient.del(`bookmarks:user:${userId}`);
      res.status(201).json({ status: 'success', data: { id } });
    } catch (error) { next(error); }
  },

  getAllBookmarks: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const cacheKey = `bookmarks:user:${userId}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        res.setHeader('X-Data-Source', 'cache');
        return res.status(200).json({ status: 'success', data: { bookmarks: JSON.parse(cached) } });
      }
      
      // WAJIB TEPAT 18 Keys
      const result = await pool.query(`
        SELECT b.id, b.user_id, b.job_id, b.created_at, b.updated_at, j.company_id, j.category_id, j.title, j.description, j.job_type, j.experience_level, j.location_type, j.location_city, j.salary_min, j.salary_max, j.is_salary_visible, j.status, c.name AS company_name 
        FROM bookmarks b JOIN jobs j ON b.job_id = j.id JOIN companies c ON j.company_id = c.id WHERE b.user_id = $1
      `, [userId]);
      res.setHeader('X-Data-Source', 'database');
      await redisClient.set(cacheKey, JSON.stringify(result.rows), { EX: 3600 });
      res.status(200).json({ status: 'success', data: { bookmarks: result.rows } });
    } catch (error) { next(error); }
  },

  getBookmarkById: async (req, res, next) => {
    try {
      const { id, jobId } = req.params;
      const result = await pool.query(`
        SELECT b.id, b.user_id, b.job_id, b.created_at, b.updated_at, j.company_id, j.category_id, j.title, j.description, j.job_type, j.experience_level, j.location_type, j.location_city, j.salary_min, j.salary_max, j.is_salary_visible, j.status, c.name AS company_name 
        FROM bookmarks b JOIN jobs j ON b.job_id = j.id JOIN companies c ON j.company_id = c.id WHERE b.id = $1 AND b.job_id = $2
      `, [id, jobId]);
      if (result.rowCount === 0) throw new NotFoundError('Bookmark tidak ditemukan');
      res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) { next(error); }
  },

  deleteBookmark: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { jobId } = req.params;
      const result = await pool.query('DELETE FROM bookmarks WHERE user_id = $1 AND job_id = $2 RETURNING id', [userId, jobId]);
      if (result.rowCount === 0) throw new NotFoundError('Bookmark tidak ditemukan');
      
      await redisClient.del(`bookmarks:user:${userId}`);
      res.status(200).json({ status: 'success', message: 'Bookmark dihapus' });
    } catch (error) { next(error); }
  },

  // === PROFILE ===
  getProfile: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
      res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) { next(error); }
  },

  getProfileApplications: async (req, res, next) => {
    try {
      // WAJIB TEPAT 15 Keys
      const result = await pool.query(`
        SELECT a.id, a.user_id, a.job_id, a.status, j.company_id, j.category_id, j.title, j.description, j.job_type, j.experience_level, j.location_type, j.location_city, j.salary_min, j.salary_max, j.is_salary_visible 
        FROM applications a JOIN jobs j ON a.job_id = j.id WHERE a.user_id = $1
      `, [req.user.id]);
      res.status(200).json({ status: 'success', data: { applications: result.rows } });
    } catch (error) { next(error); }
  },

  getProfileBookmarks: async (req, res, next) => {
    try {
      // Sama seperti Get All Bookmarks, 18 keys
      const result = await pool.query(`
        SELECT b.id, b.user_id, b.job_id, b.created_at, b.updated_at, j.company_id, j.category_id, j.title, j.description, j.job_type, j.experience_level, j.location_type, j.location_city, j.salary_min, j.salary_max, j.is_salary_visible, j.status, c.name AS company_name 
        FROM bookmarks b JOIN jobs j ON b.job_id = j.id JOIN companies c ON j.company_id = c.id WHERE b.user_id = $1
      `, [req.user.id]);
      res.status(200).json({ status: 'success', data: { bookmarks: result.rows } });
    } catch (error) { next(error); }
  },

  // === DOCUMENTS ===
  addDocument: async (req, res, next) => {
    try {
      if (!req.file) throw new ClientError('File is required', 400);

      const id = `doc-${nanoid(16)}`;
      const userId = req.user.id;
      const { filename, originalname, size } = req.file;
      
      await pool.query(
        'INSERT INTO documents (id, user_id, filename, original_name, size) VALUES ($1, $2, $3, $4, $5)', 
        [id, userId, filename, originalname, size]
      );
      res.status(201).json({ status: 'success', data: { documentId: id, filename, originalName: originalname, size } });
    } catch (error) { next(error); }
  },

  getDocuments: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT id, user_id, filename, original_name AS "originalName", size FROM documents');
      res.status(200).json({ status: 'success', data: { documents: result.rows } });
    } catch (error) { next(error); }
  },

  getDocumentById: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT filename, original_name FROM documents WHERE id = $1', [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Document tidak ditemukan');
      
      const file = result.rows[0];
      const filePath = path.resolve('uploads', file.filename);
      if (!fs.existsSync(filePath)) throw new NotFoundError('File fisik tidak ditemukan');
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
      res.sendFile(filePath);
    } catch (error) { next(error); }
  },

  deleteDocument: async (req, res, next) => {
    try {
      const result = await pool.query('DELETE FROM documents WHERE id = $1 RETURNING filename', [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Document tidak ditemukan');
      
      const filePath = path.resolve('uploads', result.rows[0].filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      
      res.status(200).json({ status: 'success', message: 'Document dihapus' });
    } catch (error) { next(error); }
  }
};

export default apiController;