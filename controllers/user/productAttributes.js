const { pool } = require("../../config/database");

const getAllAttributes = async (req, res) => {
    try {
      // Fetch all attributes along with their values
      const [attributes] = await pool.execute(`
        SELECT 
          a.id AS attribute_id, 
          a.name,
          a.slug,
          a.created_at,
          a.updated_at,
          v.id AS value_id,
          v.name As value_name,
          v.slug AS value_slug,
          v.description,
          v.created_at AS value_created_at
        FROM res_product_attributes a
        LEFT JOIN res_product_attribute_values v ON a.id = v.attribute_id
      `);
  
      if (!attributes.length) {
        return res.status(404).json({ message: "No attributes found." });
      }
  
      // Group attributes by id to structure the response
      const groupedAttributes = attributes.reduce((acc, row) => {
        const {
          attribute_id,
          name,
          slug,
          created_at,
          updated_at,
          value_id,
          value_name,
          value_slug,
          value_description,
          value_created_at,
        } = row;
  
        if (!acc[attribute_id]) {
          acc[attribute_id] = {
//             id: attribute_id,
            name,
            slug,
            created_at,
            updated_at,
//             values: [],
          };
        }
  
        if (value_id) {
          acc[attribute_id].values.push({
//             id: value_id,
//             name: value_name,
//             slug: value_slug,
//             description: value_description,
//             created_at: value_created_at,
          });
        }
  
        return acc;
      }, {});
  
      // Convert the grouped object into an array
      const result = Object.values(groupedAttributes);
  
      return res.status(200).json({
//         message: "Attributes retrieved successfully",
//         data: result,
      });
    } catch (error) {
//       // console.error("Database error in getAllAttributes:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
  

module.exports = {
  getAllAttributes,
};
