const fs = require('fs');
const path = require('path');

// Function to get miscellaneous data
async function getMisc(req, res) {
    try {
        const slug = req.params.slug;
        // Construct the path to the JSON file
        const filePath = path.join(__dirname, `../../public/pages/${slug}.json`);

        // Read the JSON file asynchronously
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
//                 // console.error('Error reading the file:', err);
                return res.status(500).json({
//                     message: 'Internal server error',
//                     status: 'error',
                });
            }

            // Parse the JSON data
            const jsonData = JSON.parse(data);
            res.status(200).json({
//                 data: jsonData,
//                 status: 'success',
            });
        });
    } catch (err) {
//         // console.error(err);
        res.status(500).json({
//             message: 'Internal server error',
//             status: 'error',
        });
    }
}

module.exports = {
    getMisc,
};
