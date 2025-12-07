var express = require('express');
var router = express.Router();

const SitemapController = require('../../controllers/admin/sitemap');

router.get('/folders', SitemapController.getAllFolders);
router.get('/files', SitemapController.getAllFiles);
router.get('/static-pages', SitemapController.getStaticPages);
router.post('/generate-sitemap-xml', SitemapController.generateSitemapXML);
router.get('/download-sitemap-xml', SitemapController.downloadSitemapXML);
router.get('/status', SitemapController.getSitemapStatus);

module.exports = router;
 
