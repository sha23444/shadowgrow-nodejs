const { pool } = require("../../config/database");

function extractYouTubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace('/', '') || null;
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      // e.g., /embed/VIDEO_ID or /shorts/VIDEO_ID
      const parts = u.pathname.split('/').filter(Boolean);
      const embedIndex = parts.findIndex(p => p === 'embed' || p === 'shorts' || p === 'watch');
      if (embedIndex >= 0 && parts[embedIndex + 1]) return parts[embedIndex + 1];
      if (parts.length) return parts[parts.length - 1];
    }
  } catch (_) {
    return null;
  }
  return null;
}

async function getVideos(req, res) {
  const { category } = req.query; // can be category_id or category_name
  try {
    const params = [];
    let where = '';
    if (category) {
      // Allow numeric id or name
      where = `WHERE v.video_id IN (
        SELECT vcr.video_id
        FROM res_video_categories_relationship vcr
        JOIN res_video_categories vc ON vc.category_id = vcr.category_id
        WHERE vc.category_id = ? OR vc.category_name = ?
      )`;
      params.push(Number(category) || 0, String(category));
    }

    const [rows] = await pool.query(
      `
      SELECT 
        v.video_id,
        v.video_url,
        v.thumbnail,
        v.title,
        v.description
      FROM res_videos v
      ${where}
      ORDER BY v.video_id DESC
      `,
      params
    );

    // Load categories mapping for returned videos
    const videoIds = rows.map(r => r.video_id);
    let categoriesByVideoId = {};
    if (videoIds.length) {
      const [catRows] = await pool.query(
        `
        SELECT vcr.video_id, vc.category_id, vc.category_name
        FROM res_video_categories_relationship vcr
        JOIN res_video_categories vc ON vc.category_id = vcr.category_id
        WHERE vcr.video_id IN ( ${videoIds.map(() => '?').join(', ')} )
        `,
        videoIds
      );
      categoriesByVideoId = catRows.reduce((acc, row) => {
        if (!acc[row.video_id]) acc[row.video_id] = [];
        acc[row.video_id].push({ id: row.category_id, name: row.category_name });
        return acc;
      }, {});
    }

    const data = rows.map(r => {
      const youtubeId = extractYouTubeId(r.video_url);
      return {
        video_id: r.video_id,
        title: r.title,
        description: r.description,
        video_url: r.video_url,
        youtube_id: youtubeId,
        embed_url: youtubeId ? `https://www.youtube.com/embed/${youtubeId}` : null,
        thumbnail: r.thumbnail,
        categories: categoriesByVideoId[r.video_id] || [],
      };
    });

    res.status(200).json({
      status: "success",
      response: {
        data,
        totalCount: data.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

async function getVideoCategories(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT category_id AS id, category_name AS name FROM res_video_categories ORDER BY name ASC`
    );
    res.status(200).json({
      status: "success",
      response: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

module.exports = {
  getVideos,
  getVideoCategories,
};
