const express = require("express");
const router = express.Router();

// Controllers
const skillTagsController = require("../../controllers/admin/jobs/skillTag");
const jobApplicationsController = require("../../controllers/admin/jobs/application");
const jobNotificationsController = require("../../controllers/admin/jobs/notifications");
const jobSkillsController = require("../../controllers/admin/jobs/skills");
const jobsController = require("../../controllers/admin/jobs/jobs");


// Jobs Routes
router.post("/jobs", jobsController.addJob); // Add a new job
router.get("/jobs", jobsController.getAllJobs); // Get all jobs
router.get("/jobs/:job_id", jobsController.getJobById); // Get a single job by ID
router.patch("/jobs", jobsController.updateJob); // Update a job
router.delete("/jobs", jobsController.deleteJob); // Delete a job

// Skill Tags Routes
router.post("/skill-tags", skillTagsController.addSkillTag); // Add a new skill tag
router.get("/skill-tags", skillTagsController.getSkillTags); // Get all skill tags
router.delete("/skill-tags", skillTagsController.deleteSkillTag); // Delete a skill tag

// Job Applications Routes
router.post("/job-applications", jobApplicationsController.addJobApplication); // Add a job application
router.get("/job-applications", jobApplicationsController.getJobApplications); // Get all job applications
router.patch("/job-applications", jobApplicationsController.updateApplicationStatus); // Update job application status
router.delete("/job-applications", jobApplicationsController.deleteJobApplication); // Delete a job application

// Job Notifications Routes
router.post("/job-notifications", jobNotificationsController.addNotification); // Add a notification
router.get("/job-notifications", jobNotificationsController.getNotifications); // Get all notifications
router.patch("/job-notifications", jobNotificationsController.updateNotificationStatus); // Update notification status
router.delete("/job-notifications", jobNotificationsController.deleteNotification); // Delete a notification

// Job Skills Routes
router.post("/job-skills", jobSkillsController.addJobSkill); // Add a job-skill mapping
router.get("/job-skills", jobSkillsController.getJobSkills); // Get all job-skill mappings
router.delete("/job-skills", jobSkillsController.deleteJobSkill); // Delete a job-skill mapping

module.exports = router;
