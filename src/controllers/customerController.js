const customerService = require('../services/customerService');
const CustomerDto = require('../dtos/customerDto');
const { ResourceIdDto } = require('../dtos/commonDto');

class CustomerController {
  list = async (req, res, next) => {
    try {
      res.json(await customerService.list());
    } catch (error) {
      next(error);
    }
  };

  get = async (req, res, next) => {
    try {
      res.json(await customerService.get(new ResourceIdDto(req.params.id).id));
    } catch (error) {
      next(error);
    }
  };

  create = async (req, res, next) => {
    try {
      res.status(201).json(await customerService.create(new CustomerDto(req.body)));
    } catch (error) {
      next(error);
    }
  };

  update = async (req, res, next) => {
    try {
      const id = new ResourceIdDto(req.params.id);
      res.json(await customerService.update(id.id, new CustomerDto(req.body)));
    } catch (error) {
      next(error);
    }
  };

  remove = async (req, res, next) => {
    try {
      await customerService.remove(new ResourceIdDto(req.params.id).id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new CustomerController();
