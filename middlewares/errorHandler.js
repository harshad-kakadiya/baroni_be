export const notFoundHandler = (req, res, _next) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
};

export const globalErrorHandler = (err, _req, res, _next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ success: false, message });
};


