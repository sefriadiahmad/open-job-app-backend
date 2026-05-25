import ClientError from '../exceptions/ClientError.js';

// eslint-disable-next-line no-unused-vars
const errorMiddleware = (err, req, res, next) => {
  if (err.message === 'File too large' || err.message === 'Hanya file PDF yang diperbolehkan' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ status: 'failed', message: 'File is required and must be PDF under 5MB' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ status: 'failed', message: 'Format JSON tidak valid' });
  }
  if (err instanceof ClientError) {
    return res.status(err.statusCode).json({ status: 'failed', message: err.message });
  }
  console.error(err);
  return res.status(500).json({ status: 'error', message: 'Maaf, terjadi kegagalan pada server kami.' });
};

export default errorMiddleware;