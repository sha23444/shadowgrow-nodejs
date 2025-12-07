const express = require("express");
const router = express.Router();

const MailController = require("../../controllers/admin/mailTemplates");

router.get("/system", MailController.getSystemTemplates);
router.get("/partials", MailController.getPartialTemplates);
router.get("/custom", MailController.getCustomTemplates);
router.post("/custom/add", MailController.addCustomTemplate);
router.delete("/custom/delete/:templateId",MailController.deleteTemplates);
router.put("/update/:templateId", MailController.updateTemplates);
router.get("/template", MailController.getTemplateDetails);


module.exports = router;
