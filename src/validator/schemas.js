import Joi from 'joi';
import ClientError from '../exceptions/ClientError.js';

export const UserPayloadSchema = Joi.object({
  name: Joi.string().min(1).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string()
});

export const AuthPayloadSchema = Joi.object({
  email: Joi.string().required(),
  password: Joi.string().required()
});

export const RefreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
});

export const CompanyPayloadSchema = Joi.object({
  name: Joi.string().min(1).required(),
  location: Joi.string().min(1).required(),
  description: Joi.string().allow('', null)
});

export const CompanyUpdateSchema = Joi.object({
  name: Joi.string().min(1),
  location: Joi.string().min(1),
  description: Joi.string().allow('', null)
}).min(1);

export const CategoryPayloadSchema = Joi.object({
  name: Joi.string().min(1).required()
});

export const JobPayloadSchema = Joi.object({
  company_id: Joi.string().required(),
  category_id: Joi.string().required(),
  title: Joi.string().min(1).required(),
  description: Joi.string().allow('', null),
  job_type: Joi.string().allow('', null),
  experience_level: Joi.string().allow('', null),
  location_type: Joi.string().allow('', null),
  location_city: Joi.string().allow('', null),
  salary_min: Joi.number().allow(null),
  salary_max: Joi.number().allow(null),
  is_salary_visible: Joi.boolean(),
  status: Joi.string()
});

export const JobUpdateSchema = Joi.object({
  company_id: Joi.string(),
  category_id: Joi.string(),
  title: Joi.string().min(1),
  description: Joi.string().allow('', null),
  job_type: Joi.string().allow('', null),
  experience_level: Joi.string().allow('', null),
  location_type: Joi.string().allow('', null),
  location_city: Joi.string().allow('', null),
  salary_min: Joi.number().allow(null),
  salary_max: Joi.number().allow(null),
  is_salary_visible: Joi.boolean(),
  status: Joi.string()
}).min(1);

export const ApplicationPayloadSchema = Joi.object({
  user_id: Joi.string().required(),
  job_id: Joi.string().required(),
  status: Joi.string()
});

export const ApplicationUpdateSchema = Joi.object({
  status: Joi.string().required()
});

export const validate = (schema, payload) => {
  const result = schema.validate(payload);
  if (result.error) {
    throw new ClientError(result.error.message, 400);
  }
};