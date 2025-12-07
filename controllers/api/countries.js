const { pool } = require("../../config/database");

async function getCountries(req, res) {
  try {
    const [countries] = await pool.query(
      "SELECT id, name, iso2, phonecode, emoji FROM countries"
    ); // Modify columns as needed
    res.status(200).json({ data: countries, status: "success" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error", status: "error" });
  }
}

async function getStates(req, res) {
  const {country_code} = req.body;

  try {
    const [states] = await pool.query(
      "SELECT name, iso2 FROM states WHERE country_code = ?",
      [country_code]
    );
    res.status(200).json({data: states, status: "success" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error", status: "error" });
  }
}


async function getCities(req, res) {
  const { state_code, country_code } = req.body;
  try {

    const [cities] = await pool.query(
      "SELECT name FROM cities WHERE country_code = ? AND state_code = ?",
      [country_code, state_code]
    );
    console.log(cities);

    res.status(200).json({ data: cities, status: "success" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error", status: "error" });
  }
}

module.exports = {
  getCountries,
  getStates,
    getCities
};
