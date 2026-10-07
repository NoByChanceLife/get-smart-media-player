/**
 * Get Smart Media Player — M3U / M3U8 Playlist Parser & Engine
 * Supports remote URL playlists, raw content, EXTINF parsing, group extraction,
 * logos, EPG tags, and playable URL preservation.
 */

import { XtreamCategory, XtreamLiveStream, XtreamVodStream } from '../types/xtream';

export interface ParsedM3uResult {
  categories: XtreamCategory[];
  liveStreams: XtreamLiveStream[];
  vodStreams: XtreamVodStream[];
}

export function parseM3uContent(
  content: string,
  serverId: string,
  serverName: string,
  badgeColor: string
): ParsedM3uResult {
  if (!content || typeof content !== 'string') {
    throw new Error('Playlist content is empty.');
  }

  // Strip UTF-8 BOM if present
  const sanitizedContent = content.replace(/^\uFEFF/, '').trim();

  // Detect HTML error pages returned instead of playlists
  const trimmedLower = sanitizedContent.toLowerCase();
  if (trimmedLower.startsWith('<!doctype html') || trimmedLower.startsWith('<html') || trimmedLower.includes('<head>')) {
    throw new Error('Server returned an HTML error webpage instead of an M3U playlist. Check the playlist URL.');
  }

  // Split lines accounting for \r\n and \n
  const rawLines = sanitizedContent.split(/\r?\n/);
  const categoriesMap = new Map<string, XtreamCategory>();
  const liveStreams: XtreamLiveStream[] = [];
  const vodStreams: XtreamVodStream[] = [];

  // Default category
  categoriesMap.set('all', {
    category_id: 'all',
    category_name: '⭐ All Channels',
    serverId,
    serverName,
  });

  let currentInfo: {
    name: string;
    logo?: string;
    groupTitle?: string;
    tvgId?: string;
    tvgName?: string;
    chno?: number;
  } | null = null;

  let streamCounter = 1;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      // Attribute extraction with case-insensitive regex
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const idMatch = line.match(/tvg-id="([^"]*)"/i);
      const nameAttrMatch = line.match(/tvg-name="([^"]*)"/i);
      const chnoMatch = line.match(/tvg-chno="?([0-9]+)"?/i);

      // Channel title is after the last comma
      const commaIndex = line.lastIndexOf(',');
      let rawTitle = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : 'Channel';
      if (!rawTitle && nameAttrMatch) {
        rawTitle = nameAttrMatch[1];
      }

      currentInfo = {
        name: rawTitle || `Channel ${streamCounter}`,
        logo: logoMatch ? logoMatch[1] : undefined,
        groupTitle: groupMatch ? groupMatch[1].trim() : undefined,
        tvgId: idMatch ? idMatch[1] : undefined,
        tvgName: nameAttrMatch ? nameAttrMatch[1] : undefined,
        chno: chnoMatch ? parseInt(chnoMatch[1], 10) : undefined,
      };
    } else if (line.startsWith('#EXTGRP:') && currentInfo) {
      // Some providers supply #EXTGRP: tag for category
      const grp = line.replace('#EXTGRP:', '').trim();
      if (grp && !currentInfo.groupTitle) {
        currentInfo.groupTitle = grp;
      }
    } else if (!line.startsWith('#') && currentInfo) {
      // Stream URL (preserve full URL, parameters, and tokens intact)
      const streamUrl = line;
      const groupName = currentInfo.groupTitle || 'General';
      const catId = `m3u_cat_${groupName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      if (!categoriesMap.has(catId)) {
        categoriesMap.set(catId, {
          category_id: catId,
          category_name: groupName,
          serverId,
          serverName,
        });
      }

      const lowerUrl = streamUrl.toLowerCase();
      const lowerGroup = groupName.toLowerCase();

      const isVod =
        lowerUrl.includes('.mp4') ||
        lowerUrl.includes('.mkv') ||
        lowerUrl.includes('/movie/') ||
        lowerGroup.includes('movie') ||
        lowerGroup.includes('vod') ||
        lowerGroup.includes('cinema') ||
        lowerGroup.includes('films');

      if (isVod) {
        vodStreams.push({
          num: currentInfo.chno || streamCounter,
          name: currentInfo.name,
          stream_type: 'movie',
          stream_id: `${serverId}_vod_${streamCounter}`,
          stream_icon: currentInfo.logo || '',
          category_id: catId,
          direct_source: streamUrl,
          container_extension: lowerUrl.includes('.mkv') ? 'mkv' : 'mp4',
          serverId,
          serverName,
          serverBadgeColor: badgeColor,
        });
      } else {
        liveStreams.push({
          num: currentInfo.chno || streamCounter,
          name: currentInfo.name,
          stream_type: 'live',
          stream_id: `${serverId}_live_${streamCounter}`,
          stream_icon: currentInfo.logo || '',
          epg_channel_id: currentInfo.tvgId,
          category_id: catId,
          direct_source: streamUrl,
          tv_archive: 0,
          serverId,
          serverName,
          serverBadgeColor: badgeColor,
        });
      }

      streamCounter++;
      currentInfo = null;
    }
  }

  if (liveStreams.length === 0 && vodStreams.length === 0) {
    throw new Error('Playlist malformed: no playable stream lines or valid #EXTINF tags found.');
  }

  return {
    categories: Array.from(categoriesMap.values()),
    liveStreams,
    vodStreams,
  };
}
