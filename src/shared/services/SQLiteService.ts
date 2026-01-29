// src/shared/services/SQLiteService.ts
import * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

// Define the database name
const DATABASE_NAME = 'solana_app_kit.db';

// Interface for Community data
export interface Community {
  id: string;
  creator_public_key: string;
  name: string;
  type: 'public' | 'private';
  gating_mint: string | null;
  created_at: number;
  is_member: number; // 0 or 1
}

// Interface for Community Post data
export interface CommunityPost {
  id: string;
  community_id: string;
  author_public_key: string;
  content: string;
  signature: string;
  timestamp: number;
  likes_count: number;
  reposts_count: number;
  is_liked_by_me: number; // 0 or 1
  is_reposted_by_me: number; // 0 or 1
  author_name: string | null;
  is_moderated: number; // 0 or 1
}

export class SQLiteService {
  private static db: SQLite.SQLiteDatabase | null = null;

  /**
   * Initializes the SQLite database and creates tables if they don't exist.
   */
  static async initDb(): Promise<void> {
    if (this.db) {
      console.log('Database already initialized.');
      return;
    }

    // Ensure the database directory exists
    const dbDir = `${FileSystem.documentDirectory}SQLite/`;
    await FileSystem.makeDirectoryAsync(dbDir, { intermediates: true });

    // Open the database
    this.db = SQLite.openDatabase(DATABASE_NAME);

    // Run schema creation statements
    await new Promise<void>((resolve, reject) => {
      this.db?.transaction(
        tx => {
          // Communities table
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS communities (
              id TEXT PRIMARY KEY,
              creator_public_key TEXT NOT NULL,
              name TEXT NOT NULL,
              type TEXT NOT NULL,
              gating_mint TEXT,
              created_at INTEGER NOT NULL,
              is_member INTEGER NOT NULL DEFAULT 0
            );`,
            [],
            () => console.log('Table "communities" checked/created.'),
            (_, error) => {
              console.error('Error creating communities table:', error);
              reject(error);
              return true; // Indicate that the error was handled
            }
          );

          // Community Posts table
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS community_posts (
              id TEXT PRIMARY KEY,
              community_id TEXT NOT NULL,
              author_public_key TEXT NOT NULL,
              content TEXT NOT NULL,
              signature TEXT NOT NULL,
              timestamp INTEGER NOT NULL,
              likes_count INTEGER DEFAULT 0,
              reposts_count INTEGER DEFAULT 0,
              is_liked_by_me INTEGER DEFAULT 0,
              is_reposted_by_me INTEGER DEFAULT 0,
              author_name TEXT,
              is_moderated INTEGER DEFAULT 0,
              FOREIGN KEY (community_id) REFERENCES communities (id) ON DELETE CASCADE
            );`,
            [],
            () => console.log('Table "community_posts" checked/created.'),
            (_, error) => {
              console.error('Error creating community_posts table:', error);
              reject(error);
              return true;
            }
          );

          // Indexes
          tx.executeSql(
            `CREATE INDEX IF NOT EXISTS idx_community_posts_community_id ON community_posts (community_id);`,
            [],
            () => console.log('Index "idx_community_posts_community_id" checked/created.'),
            (_, error) => {
              console.error('Error creating idx_community_posts_community_id:', error);
              reject(error);
              return true;
            }
          );

          tx.executeSql(
            `CREATE INDEX IF NOT EXISTS idx_community_posts_timestamp ON community_posts (community_id, timestamp DESC);`,
            [],
            () => console.log('Index "idx_community_posts_timestamp" checked/created.'),
            (_, error) => {
              console.error('Error creating idx_community_posts_timestamp:', error);
              reject(error);
              return true;
            }
          );
        },
        error => {
          console.error('Transaction failed:', error);
          reject(error);
        },
        () => {
          console.log('Database initialization and table creation complete.');
          resolve();
        }
      );
    });
  }

  /**
   * Executes a SQL query.
   * @param sql The SQL query string.
   * @param params Optional parameters for the query.
   * @returns A promise that resolves with the SQLResultSet.
   */
  private static async executeSql(sql: string, params: any[] = []): Promise<SQLite.SQLResultSet> {
    if (!this.db) {
      throw new Error('Database is not initialized. Call initDb() first.');
    }
    return new Promise((resolve, reject) => {
      this.db?.transaction(tx => {
        tx.executeSql(
          sql,
          params,
          (_, resultSet) => resolve(resultSet),
          (_, error) => {
            console.error(`Error executing SQL: ${sql} with params: ${params}`, error);
            reject(error);
            return true;
          }
        );
      });
    });
  }

  // --- Community Management ---

  /**
   * Inserts a new community into the database.
   * @param community The community object to insert.
   */
  static async insertCommunity(community: Community): Promise<void> {
    const sql = `INSERT OR REPLACE INTO communities (id, creator_public_key, name, type, gating_mint, created_at, is_member) VALUES (?, ?, ?, ?, ?, ?, ?);`;
    const params = [
      community.id,
      community.creator_public_key,
      community.name,
      community.type,
      community.gating_mint,
      community.created_at,
      community.is_member,
    ];
    await this.executeSql(sql, params);
  }

  /**
   * Retrieves all communities from the database.
   * @returns A promise that resolves with an array of Community objects.
   */
  static async getCommunities(): Promise<Community[]> {
    const sql = `SELECT * FROM communities ORDER BY created_at DESC;`;
    const resultSet = await this.executeSql(sql);
    return resultSet.rows._array as Community[];
  }

  /**
   * Retrieves a single community by its ID.
   * @param id The ID of the community.
   * @returns A promise that resolves with the Community object, or null if not found.
   */
  static async getCommunityById(id: string): Promise<Community | null> {
    const sql = `SELECT * FROM communities WHERE id = ?;`;
    const resultSet = await this.executeSql(sql, [id]);
    return resultSet.rows.length > 0 ? (resultSet.rows._array[0] as Community) : null;
  }

  /**
   * Updates the membership status of a community.
   * @param communityId The ID of the community.
   * @param isMember The new membership status (0 or 1).
   */
  static async updateCommunityMembership(communityId: string, isMember: number): Promise<void> {
    const sql = `UPDATE communities SET is_member = ? WHERE id = ?;`;
    await this.executeSql(sql, [isMember, communityId]);
  }

  // --- Community Post Management ---

  /**
   * Inserts a new community post into the database.
   * @param post The community post object to insert.
   */
  static async insertCommunityPost(post: CommunityPost): Promise<void> {
    const sql = `INSERT OR REPLACE INTO community_posts (id, community_id, author_public_key, content, signature, timestamp, likes_count, reposts_count, is_liked_by_me, is_reposted_by_me, author_name, is_moderated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;
    const params = [
      post.id,
      post.community_id,
      post.author_public_key,
      post.content,
      post.signature,
      post.timestamp,
      post.likes_count,
      post.reposts_count,
      post.is_liked_by_me,
      post.is_reposted_by_me,
      post.author_name,
      post.is_moderated,
    ];
    await this.executeSql(sql, params);
  }

  /**
   * Retrieves posts for a specific community, ordered by timestamp descending.
   * @param communityId The ID of the community.
   * @returns A promise that resolves with an array of CommunityPost objects.
   */
  static async getCommunityPosts(communityId: string): Promise<CommunityPost[]> {
    const sql = `SELECT * FROM community_posts WHERE community_id = ? ORDER BY timestamp DESC;`;
    const resultSet = await this.executeSql(sql, [communityId]);
    return resultSet.rows._array as CommunityPost[];
  }

  /**
   * Updates the engagement counts (likes/reposts) for a specific community post.
   * @param postId The ID of the post.
   * @param likesCount The new likes count.
   * @param repostsCount The new reposts count.
   * @param isLikedByMe The new is_liked_by_me status.
   * @param isRepostedByMe The new is_reposted_by_me status.
   */
  static async updateCommunityPostEngagement(
    postId: string,
    likesCount: number,
    repostsCount: number,
    isLikedByMe: number,
    isRepostedByMe: number
  ): Promise<void> {
    const sql = `UPDATE community_posts SET likes_count = ?, reposts_count = ?, is_liked_by_me = ?, is_reposted_by_me = ? WHERE id = ?;`;
    await this.executeSql(sql, [likesCount, repostsCount, isLikedByMe, isRepostedByMe, postId]);
  }

  /**
   * Marks a community post as moderated (e.g., deleted by creator).
   * @param postId The ID of the post.
   * @param isModerated The moderation status (0 or 1).
   */
  static async updateCommunityPostModeration(postId: string, isModerated: number): Promise<void> {
    const sql = `UPDATE community_posts SET is_moderated = ? WHERE id = ?;`;
    await this.executeSql(sql, [isModerated, postId]);
  }

  /**
   * Deletes a community post from the database.
   * @param postId The ID of the post to delete.
   */
  static async deleteCommunityPost(postId: string): Promise<void> {
    const sql = `DELETE FROM community_posts WHERE id = ?;`;
    await this.executeSql(sql, [postId]);
  }

  /**
   * Clears all data from the communities and community_posts tables.
   * USE WITH CAUTION.
   */
  static async clearAllData(): Promise<void> {
    await this.executeSql(`DELETE FROM community_posts;`);
    await this.executeSql(`DELETE FROM communities;`);
    console.log('All community data cleared.');
  }
}
