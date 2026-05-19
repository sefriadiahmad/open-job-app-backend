import express from 'express';
import apiController from '../controllers/apiController.js';
import verifyToken from '../middlewares/authMiddleware.js';

const router = express.Router();

// === PUBLIC ENDPOINTS ===

// Users
router.post('/users', apiController.registerUser);
router.get('/users/:id', apiController.getUserById);

// Authentications
router.post('/authentications', apiController.login);
router.put('/authentications', apiController.putAuth);

// Companies
router.get('/companies', apiController.getCompanies);
router.get('/companies/:id', apiController.getCompanyById);

// Categories
router.get('/categories', apiController.getCategories);
router.get('/categories/:id', apiController.getCategoryById);

// Jobs
router.get('/jobs', apiController.getJobs);
router.get('/jobs/company/:companyId', apiController.getJobsByCompanyId);
router.get('/jobs/category/:categoryId', apiController.getJobsByCategoryId);
router.get('/jobs/:id', apiController.getJobById);


// === PROTECTED ENDPOINTS ===
router.use(verifyToken); // Terapkan middleware untuk rute di bawah ini

// Authentications (Logout)
router.delete('/authentications', apiController.deleteAuth);

// Profile
router.get('/profile', apiController.getProfile);
router.get('/profile/applications', apiController.getProfileApplications);
router.get('/profile/bookmarks', apiController.getProfileBookmarks);

// Companies
router.post('/companies', apiController.addCompany);
router.put('/companies/:id', apiController.updateCompany);
router.delete('/companies/:id', apiController.deleteCompany);

// Categories
router.post('/categories', apiController.addCategory);
router.put('/categories/:id', apiController.updateCategory);
router.delete('/categories/:id', apiController.deleteCategory);

// Jobs
router.post('/jobs', apiController.addJob);
router.put('/jobs/:id', apiController.updateJob);
router.delete('/jobs/:id', apiController.deleteJob);

// Applications
router.post('/applications', apiController.addApplication);
router.get('/applications', apiController.getApplications);
router.get('/applications/user/:userId', apiController.getApplicationsByUserId);
router.get('/applications/job/:jobId', apiController.getApplicationsByJobId);
router.get('/applications/:id', apiController.getApplicationById);
router.put('/applications/:id', apiController.updateApplicationStatus);
router.delete('/applications/:id', apiController.deleteApplication);

// Bookmarks
router.get('/bookmarks', apiController.getAllBookmarks);
router.post('/jobs/:jobId/bookmark', apiController.addBookmark);
router.get('/jobs/:jobId/bookmark/:id', apiController.getBookmarkById);
router.delete('/jobs/:jobId/bookmark', apiController.deleteBookmark);

export default router;