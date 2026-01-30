// Response helper functions - Dùng chung cho tất cả API

export function successResponse(data, message = 'Success') {
  return {
    success: true,
    message,
    data
  };
}

export function errorResponse(error, message = 'Error', statusCode = 400) {
  return {
    success: false,
    message,
    error: error.message || error,
    statusCode
  };
}

export function sendSuccess(res, data, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json(successResponse(data, message));
}

export function sendError(res, error, message = 'Error', statusCode = 400) {
  return res.status(statusCode).json(errorResponse(error, message, statusCode));
}

