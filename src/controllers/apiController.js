import pool from '../db/pool.js';
import { nanoid } from 'nanoid';
import bcrypt from 'bcrypt';
import TokenManager from '../utils/tokenManager.js';
import NotFoundError from '../exceptions/NotFoundError.js';
import AuthenticationError from '../exceptions/AuthenticationError.js';
import ClientError from '../exceptions/ClientError.js';
import * as schemas from '../validator/schemas.js';

const apiController = {
  // USERS
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
      const { id } = req.params;
      const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [id]);
      if (result.rowCount === 0) throw new NotFoundError('User tidak ditemukan');
      res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) { next(error); }
  },

  // AUTHENTICATIONS
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

  // COMPANIES
  addCompany: async (req, res, next) => {
    try {
      schemas.validate(schemas.CompanyPayloadSchema, req.body);
      const { name, location, description } = req.body;
      const id = `company-${nanoid(16)}`;
      await pool.query('INSERT INTO companies (id, name, location, description) VALUES ($1, $2, $3, $4)', [id, name, location, description]);
      res.status(201).json({ status: 'success', data: { id } });
    } catch (error) { next(error); }
  },
  getCompanies: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM companies');
      res.status(200).json({ status: 'success', data: { companies: result.rows } });
    } catch (error) { next(error); }
  },
  getCompanyById: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Company tidak ditemukan');
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
      res.status(200).json({ status: 'success', message: 'Company diperbarui' });
    } catch (error) { next(error); }
  },
  deleteCompany: async (req, res, next) => {
    try {
      const result = await pool.query('DELETE FROM companies WHERE id = $1 RETURNING id', [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Company tidak ditemukan');
      res.status(200).json({ status: 'success', message: 'Company dihapus' });
    } catch (error) { next(error); }
  },

  // CATEGORIES
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
      const result = await pool.query('SELECT * FROM categories');
      res.status(200).json({ status: 'success', data: { categories: result.rows } });
    } catch (error) { next(error); }
  },
  getCategoryById: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
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

  // JOBS
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
      let query = `SELECT jobs.*, companies.name AS company_name FROM jobs JOIN companies ON jobs.company_id = companies.id WHERE 1=1`;
      const values = [];
      let count = 1;

      if (title) { query += ` AND jobs.title ILIKE $${count++}`; values.push(`%${title}%`); }
      if (companyName) { query += ` AND companies.name ILIKE $${count++}`; values.push(`%${companyName}%`); }

      const result = await pool.query(query, values);
      res.status(200).json({ status: 'success', data: { jobs: result.rows } });
    } catch (error) { next(error); }
  },
  getJobById: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Job tidak ditemukan');
      res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) { next(error); }
  },
  getJobsByCompanyId: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM jobs WHERE company_id = $1', [req.params.companyId]);
      res.status(200).json({ status: 'success', data: { jobs: result.rows } });
    } catch (error) { next(error); }
  },
  getJobsByCategoryId: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM jobs WHERE category_id = $1', [req.params.categoryId]);
      res.status(200).json({ status: 'success', data: { jobs: result.rows } });
    } catch (error) { next(error); }
  },
  updateJob: async (req, res, next) => {
    try {
      schemas.validate(schemas.JobUpdateSchema, req.body);
      const { title, description, salary_max } = req.body;
      const result = await pool.query(
        'UPDATE jobs SET title = COALESCE($1, title), description = COALESCE($2, description), salary_max = COALESCE($3, salary_max) WHERE id = $4 RETURNING id',
        [title, description, salary_max, req.params.id]
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

  // APPLICATIONS
  addApplication: async (req, res, next) => {
    try {
      schemas.validate(schemas.ApplicationPayloadSchema, req.body);
      const { user_id, job_id, status = 'pending' } = req.body;
      const id = `application-${nanoid(16)}`;
      await pool.query('INSERT INTO applications (id, user_id, job_id, status) VALUES ($1, $2, $3, $4)', [id, user_id, job_id, status]);
      res.status(201).json({ status: 'success', data: { id } });
    } catch (error) { next(error); }
  },
  getApplications: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM applications');
      res.status(200).json({ status: 'success', data: { applications: result.rows } });
    } catch (error) { next(error); }
  },
  getApplicationById: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM applications WHERE id = $1', [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Application tidak ditemukan');
      res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) { next(error); }
  },
  getApplicationsByUserId: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM applications WHERE user_id = $1', [req.params.userId]);
      res.status(200).json({ status: 'success', data: { applications: result.rows } });
    } catch (error) { next(error); }
  },
  getApplicationsByJobId: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM applications WHERE job_id = $1', [req.params.jobId]);
      res.status(200).json({ status: 'success', data: { applications: result.rows } });
    } catch (error) { next(error); }
  },
  updateApplicationStatus: async (req, res, next) => {
    try {
      schemas.validate(schemas.ApplicationUpdateSchema, req.body);
      const result = await pool.query('UPDATE applications SET status = $1 WHERE id = $2 RETURNING id', [req.body.status, req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Application tidak ditemukan');
      res.status(200).json({ status: 'success', message: 'Application diperbarui' });
    } catch (error) { next(error); }
  },
  deleteApplication: async (req, res, next) => {
    try {
      const result = await pool.query('DELETE FROM applications WHERE id = $1 RETURNING id', [req.params.id]);
      if (result.rowCount === 0) throw new NotFoundError('Application tidak ditemukan');
      res.status(200).json({ status: 'success', message: 'Application dihapus' });
    } catch (error) { next(error); }
  },

  // BOOKMARKS
  addBookmark: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { jobId } = req.params;
      const id = `bookmark-${nanoid(16)}`;
      await pool.query('INSERT INTO bookmarks (id, user_id, job_id) VALUES ($1, $2, $3)', [id, userId, jobId]);
      res.status(201).json({ status: 'success', data: { id } });
    } catch (error) { next(error); }
  },
  getAllBookmarks: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const result = await pool.query('SELECT * FROM bookmarks WHERE user_id = $1', [userId]);
      res.status(200).json({ status: 'success', data: { bookmarks: result.rows } });
    } catch (error) { next(error); }
  },
  getBookmarkById: async (req, res, next) => {
    try {
      const { id, jobId } = req.params;
      const result = await pool.query('SELECT * FROM bookmarks WHERE id = $1 AND job_id = $2', [id, jobId]);
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
      res.status(200).json({ status: 'success', message: 'Bookmark dihapus' });
    } catch (error) { next(error); }
  },

  // PROFILE
  getProfile: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
      res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) { next(error); }
  },
  getProfileApplications: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM applications WHERE user_id = $1', [req.user.id]);
      res.status(200).json({ status: 'success', data: { applications: result.rows } });
    } catch (error) { next(error); }
  },
  getProfileBookmarks: async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM bookmarks WHERE user_id = $1', [req.user.id]);
      res.status(200).json({ status: 'success', data: { bookmarks: result.rows } });
    } catch (error) { next(error); }
  }
};

export default apiController;