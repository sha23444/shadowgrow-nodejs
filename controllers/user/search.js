const { pool } = require("../../config/database");
const { SEARCH_TYPE } = require(".././utils/constants");
const express = require("express");

async function fetchTagsForRefs(refIds, refType) {
  if (!Array.isArray(refIds) || refIds.length === 0) {
    return {};
  }

  const placeholders = refIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT tm.ref_id, GROUP_CONCAT(DISTINCT t.tag) AS tags
     FROM tag_map tm
     JOIN tags t ON tm.tag_id = t.id
     WHERE tm.ref_type = ?
       AND tm.ref_id IN (${placeholders})
     GROUP BY tm.ref_id`,
    [refType, ...refIds]
  );

  const tagMap = {};
  for (const row of rows) {
    tagMap[row.ref_id] = row.tags;
  }
  return tagMap;
}

// Helper function to generate search patterns
function generateSearchPatterns(query) {
  // Add phrase match, underscore, and hyphen variations
  const patterns = [`%${query}%`];
  const underscorePattern = `%${query.replace(/\s+/g, '_')}%`;
  const hyphenPattern = `%${query.replace(/\s+/g, '-')}%`;
  patterns.push(underscorePattern);
  patterns.push(hyphenPattern);

  // Add individual word matches
  const words = query.split(/\s+/).filter(term => term.length >= 2);
  words.forEach(word => {
    patterns.push(`%${word}%`);
  });
  return patterns;
}

function generateStartsWithPatterns(query) {
  // For ORDER BY: starts with (space, underscore, hyphen)
  return [
    `${query}%`,
    `${query.replace(/\s+/g, '_')}%`,
    `${query.replace(/\s+/g, '-')}%`
  ];
}

async function searchAllTables(req, res) {
  try {
    const { query, type = 0 } = req.query;
    if (!query) {
      return res.status(400).json({
        status: "error",
        message: "Query parameter is required",
      });
    }

    const searchPatterns = generateSearchPatterns(query);
    const startsWithPatterns = generateStartsWithPatterns(query);
    const limit = 20; // max 20 results per table
    const lowerQuery = query.toLowerCase();

    let results = {
      files: [],
      folders: [],
      products: [],
      categories: [],
      blogs: [],
    };

    if (type == 0) {
      try {
        const [fileResults] = await pool.execute(
          `SELECT DISTINCT f.*
          FROM res_files f
          WHERE LOWER(f.title) = LOWER(?)
            OR ${searchPatterns.map(() => 'f.title LIKE ?').join(' OR ')}
          ORDER BY
            CASE
              WHEN LOWER(f.title) = LOWER(?) THEN 0
              WHEN LOWER(f.title) LIKE LOWER(?) THEN 1
              WHEN LOWER(f.title) LIKE LOWER(?) THEN 2
              WHEN LOWER(f.title) LIKE LOWER(?) THEN 3
              WHEN f.title LIKE ? THEN 4
              WHEN f.title LIKE ? THEN 5
              WHEN f.title LIKE ? THEN 6
              ELSE 7
            END,
            f.created_at DESC
          LIMIT ?`,
          [
            lowerQuery, // for exact match in WHERE
            ...searchPatterns, // WHERE patterns
            lowerQuery, // for CASE exact match
            ...startsWithPatterns, // for CASE starts with (space, _, -)
            searchPatterns[0], // contains (space)
            searchPatterns[1], // contains (_)
            searchPatterns[2], // contains (-)
            limit
          ]
        );

        const [folderResults] = await pool.execute(
          `SELECT DISTINCT f.*
          FROM res_folders f
          WHERE LOWER(f.title) = LOWER(?)
            OR ${searchPatterns.map(() => 'f.title LIKE ?').join(' OR ')}
          ORDER BY
            CASE
              WHEN LOWER(f.title) = LOWER(?) THEN 0
              WHEN LOWER(f.title) LIKE LOWER(?) THEN 1
              WHEN LOWER(f.title) LIKE LOWER(?) THEN 2
              WHEN LOWER(f.title) LIKE LOWER(?) THEN 3
              WHEN f.title LIKE ? THEN 4
              WHEN f.title LIKE ? THEN 5
              WHEN f.title LIKE ? THEN 6
              ELSE 7
            END,
            f.created_at DESC
          LIMIT ?`,
          [
            lowerQuery, // for exact match in WHERE
            ...searchPatterns, // WHERE patterns
            lowerQuery, // for CASE exact match
            ...startsWithPatterns, // for CASE starts with (space, _, -)
            searchPatterns[0], // contains (space)
            searchPatterns[1], // contains (_)
            searchPatterns[2], // contains (-)
            limit
          ]
        );

        const fileTagsMap = await fetchTagsForRefs(
          fileResults.map(file => file.file_id),
          'file'
        );
        const folderTagsMap = await fetchTagsForRefs(
          folderResults.map(folder => folder.folder_id),
          'folder'
        );

        results.files = (fileResults || []).map(file => ({
          ...file,
          tags: fileTagsMap[file.file_id] || null,
        }));
        results.folders = (folderResults || []).map(folder => ({
          ...folder,
          tags: folderTagsMap[folder.folder_id] || null,
        }));
      } catch (error) {
        console.error('Error in search queries:', error);
        results.files = [];
        results.folders = [];
      }
    } else {
      let queryStr = "";
      let key = "";
      const lowerQuery = query.toLowerCase();

      switch (type) {
        case SEARCH_TYPE.FILES:
          queryStr = `SELECT DISTINCT f.*
          FROM res_files f
          WHERE LOWER(f.title) = LOWER(?)
            OR ${searchPatterns.map(() => 'f.title LIKE ?').join(' OR ')}
          ORDER BY
            CASE
              WHEN LOWER(f.title) = LOWER(?) THEN 0
              WHEN LOWER(f.title) LIKE LOWER(?) THEN 1
              WHEN LOWER(f.title) LIKE LOWER(?) THEN 2
              WHEN LOWER(f.title) LIKE LOWER(?) THEN 3
              WHEN f.title LIKE ? THEN 4
              WHEN f.title LIKE ? THEN 5
              WHEN f.title LIKE ? THEN 6
              ELSE 7
            END,
            f.created_at DESC
          LIMIT ?`;
          key = "files";
          break;
        case SEARCH_TYPE.FOLDERS:
          queryStr = `SELECT DISTINCT f.*
          FROM res_folders f
          WHERE LOWER(f.title) = LOWER(?)
            OR ${searchPatterns.map(() => 'f.title LIKE ?').join(' OR ')}
          ORDER BY
            CASE
              WHEN LOWER(f.title) = LOWER(?) THEN 0
              WHEN LOWER(f.title) LIKE LOWER(?) THEN 1
              WHEN LOWER(f.title) LIKE LOWER(?) THEN 2
              WHEN LOWER(f.title) LIKE LOWER(?) THEN 3
              WHEN f.title LIKE ? THEN 4
              WHEN f.title LIKE ? THEN 5
              WHEN f.title LIKE ? THEN 6
              ELSE 7
            END,
            f.created_at DESC
          LIMIT ?`;
          key = "folders";
          break;
      }

      if (queryStr) {
        try {
          const [rows] = await pool.execute(queryStr, [
            lowerQuery,
            ...searchPatterns,
            lowerQuery,
            ...startsWithPatterns,
            searchPatterns[0],
            searchPatterns[1],
            searchPatterns[2],
            limit
          ]);
          if (key === "files") {
            const tagMap = await fetchTagsForRefs(rows.map(row => row.file_id), 'file');
            results[key] = (rows || []).map(row => ({
              ...row,
              tags: tagMap[row.file_id] || null,
            }));
          } else if (key === "folders") {
            const tagMap = await fetchTagsForRefs(rows.map(row => row.folder_id), 'folder');
            results[key] = (rows || []).map(row => ({
              ...row,
              tags: tagMap[row.folder_id] || null,
            }));
          } else {
            results[key] = rows || [];
          }
        } catch (error) {
          console.error(`Error in ${key} search:`, error);
          results[key] = [];
        }
      }
    }

    res.status(200).json({
      status: "success",
      data: results
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getSearchResults(req, res) {
  try {
    const { query, type = 0, page = 1, limit = 20, sortBy = 'date', sortOrder = 'DESC' } = req.query;
    if (!query) {
      return res.status(400).json({
        status: "error",
        message: "Query parameter is required",
      });
    }

    const searchPatterns = generateSearchPatterns(query);
    const startsWithPatterns = generateStartsWithPatterns(query);
    const lowerQuery = query.toLowerCase();

    // Validate and set sort fields
    const validSortFields = {
      date: 'created_at',
      title: 'title',
      downloads: 'downloads',
      visits: 'visits',
      price: 'price',
      rating: 'rating_points'
    };

    const validFolderSortFields = {
      date: 'created_at',
      title: 'title'
    };

    const fileSortField = validSortFields[sortBy] || 'created_at';
    const folderSortField = validFolderSortFields[sortBy] || 'created_at';

    try {
      // Simplified count queries
      const fileCountQuery = `
        SELECT COUNT(DISTINCT f.file_id) as total
        FROM res_files f
        WHERE ${searchPatterns.map(() => 'f.title LIKE ?').join(' OR ')}`;

      const folderCountQuery = `
        SELECT COUNT(DISTINCT f.folder_id) as total
        FROM res_folders f
        WHERE ${searchPatterns.map(() => 'f.title LIKE ?').join(' OR ')}`;

      // Get total counts first
      const [
        [fileCount],
        [folderCount]
      ] = await Promise.all([
        pool.execute(fileCountQuery, [...searchPatterns]),
        pool.execute(folderCountQuery, [...searchPatterns])
      ]);

      const totalFolders = parseInt(folderCount[0].total) || 0;
      const totalFiles = parseInt(fileCount[0].total) || 0;
      const totalResults = totalFolders + totalFiles;
      const totalPages = Math.ceil(totalResults / limit);

      // Validate and adjust page number
      let currentPage = parseInt(page);
      if (currentPage < 1) currentPage = 1;
      if (currentPage > totalPages) currentPage = totalPages;
      
      // Calculate offset safely
      const safeOffset = Math.min((currentPage - 1) * limit, totalResults);

      // SQL queries with best-match ranking
      const fileQuery = `
        SELECT f.*
        FROM res_files f
        WHERE LOWER(f.title) = LOWER(?)
          OR ${searchPatterns.map(() => 'f.title LIKE ?').join(' OR ')}
        ORDER BY
          CASE
            WHEN LOWER(f.title) = LOWER(?) THEN 0
            WHEN LOWER(f.title) LIKE LOWER(?) THEN 1
            WHEN LOWER(f.title) LIKE LOWER(?) THEN 2
            WHEN LOWER(f.title) LIKE LOWER(?) THEN 3
            WHEN f.title LIKE ? THEN 4
            WHEN f.title LIKE ? THEN 5
            WHEN f.title LIKE ? THEN 6
            ELSE 7
          END,
          ${fileSortField} ${sortOrder}
        LIMIT ? OFFSET ?`;

      const folderQuery = `
        SELECT f.*
        FROM res_folders f
        WHERE LOWER(f.title) = LOWER(?)
          OR ${searchPatterns.map(() => 'f.title LIKE ?').join(' OR ')}
        ORDER BY
          CASE
            WHEN LOWER(f.title) = LOWER(?) THEN 0
            WHEN LOWER(f.title) LIKE LOWER(?) THEN 1
            WHEN LOWER(f.title) LIKE LOWER(?) THEN 2
            WHEN LOWER(f.title) LIKE LOWER(?) THEN 3
            WHEN f.title LIKE ? THEN 4
            WHEN f.title LIKE ? THEN 5
            WHEN f.title LIKE ? THEN 6
            ELSE 7
          END,
          ${folderSortField} ${sortOrder}
        LIMIT ? OFFSET ?`;

      // Execute queries concurrently
      const [
        [files],
        [folders]
      ] = await Promise.all([
        pool.execute(fileQuery, [
          lowerQuery,
          ...searchPatterns,
          lowerQuery,
          ...startsWithPatterns,
          searchPatterns[0],
          searchPatterns[1],
          searchPatterns[2],
          limit, safeOffset
        ]),
        pool.execute(folderQuery, [
          lowerQuery,
          ...searchPatterns,
          lowerQuery,
          ...startsWithPatterns,
          searchPatterns[0],
          searchPatterns[1],
          searchPatterns[2],
          limit, safeOffset
        ])
      ]);

      const fileTagsMap = await fetchTagsForRefs(
        (files || []).map(file => file.file_id),
        'file'
      );
      const folderTagsMap = await fetchTagsForRefs(
        (folders || []).map(folder => folder.folder_id),
        'folder'
      );

      // Prepare response
      const response = {
        folders: (folders || []).map(folder => ({
          ...folder,
          tags: folderTagsMap[folder.folder_id] || null,
        })),
        files: (files || []).map(file => ({
          ...file,
          tags: fileTagsMap[file.file_id] || null,
        })),
        searchInfo: {
          query,
          totalResults,
          currentPage,
          totalPages,
          limit,
          sortInfo: {
            sortBy,
            sortOrder,
            availableSortFields: {
              files: Object.keys(validSortFields),
              folders: Object.keys(validFolderSortFields)
            }
          },
          counts: {
            folders: totalFolders,
            files: totalFiles
          }
        }
      };

      res.status(200).json({
        response,
        status: "success",
      });
    } catch (dbError) {
      console.error("Database error:", dbError);
      res.status(500).json({
        status: "error",
        message: "Error executing database queries",
        error: dbError.message
      });
    }
  } catch (err) {
    console.error("Error performing search:", err);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function searchAllTablesCounts(req, res) {
  try {
    const { query } = req.query;
    const searchPatterns = generateSearchPatterns(query);

    const queries = [
      // Simplified files count
      pool.execute(
        `SELECT COUNT(DISTINCT f.file_id) as count
         FROM res_files f
         WHERE ${searchPatterns.map(() => 'f.title LIKE ?').join(' OR ')}`,
        [...searchPatterns]
      ),

      // Simplified folders count
      pool.execute(
        `SELECT COUNT(DISTINCT f.folder_id) as count
         FROM res_folders f
         WHERE ${searchPatterns.map(() => 'f.title LIKE ?').join(' OR ')}`,
        [...searchPatterns]
      )
    ];

    const [
      [fileCountRows],
      [folderCountRows]
    ] = await Promise.all(queries);

    const counts = {
      files: fileCountRows[0].count,
      folders: folderCountRows[0].count
    };

    res.status(200).json({
      status: "success",
      data: counts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getFolderPath(folderId) {
  const breadcrumbs = [];
  let currentFolder = null;

  if (folderId) {
    const [rows] = await pool.execute(
      "SELECT folder_id, parent_id, title, slug FROM res_folders WHERE folder_id = ?",
      [folderId]
    );

    if (rows.length > 0) {
      currentFolder = rows[0];

      while (currentFolder) {
        breadcrumbs.unshift({
          title: currentFolder.title,
          slug: currentFolder.slug,
        });

        const [parentRows] = await pool.execute(
          "SELECT folder_id, parent_id, title, slug FROM res_folders WHERE folder_id = ?",
          [currentFolder.parent_id]
        );

        if (parentRows.length === 0) {
          break;
        }

        currentFolder = parentRows[0];
      }
    }
  }

  return breadcrumbs.map((folder) => folder.slug).join("/");
}

module.exports = {
  searchAllTables,
  searchAllTablesCounts,
  getSearchResults
};