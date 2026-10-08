import {
  XtreamAuthResponse,
  XtreamCategory,
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeries,
  XtreamSeason,
  XtreamEPGProgramme,
} from '../types/xtream';

export const DEMO_AUTH_DATA: XtreamAuthResponse = {
  user_info: {
    username: 'demo_user',
    auth: 1,
    status: 'Active',
    exp_date: '1893456000', // 2030-01-01
    is_trial: '0',
    active_cons: '1',
    max_connections: '3',
    created_at: '1704067200',
    allowed_output_formats: ['m3u8', 'ts', 'mp4', 'mkv'],
    message: 'Welcome to Get Smart Media Player Demo Server',
  },
  server_info: {
    url: 'demo.getsmartmedia.tv',
    port: '8080',
    https_port: '8443',
    server_protocol: 'https',
    rtmp_port: '1935',
    timezone: 'UTC',
    time_now: new Date().toISOString(),
    process: true,
  },
};

export const DEMO_LIVE_CATEGORIES: XtreamCategory[] = [
  { category_id: 'all', category_name: 'All Channels' },
  { category_id: 'news', category_name: 'News' },
  { category_id: 'test', category_name: 'Playback Test' },
];

export const DEMO_LIVE_STREAMS: XtreamLiveStream[] = [
  {
    num: 0,
    name: 'Get Smart Playback Control',
    stream_type: 'live',
    stream_id: 100,
    stream_icon: '',
    category_id: 'test',
    tv_archive: 0,
    tv_archive_duration: 0,
    direct_source: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
    currentProgram: 'Direct MP4 playback test',
  },
  {
    num: 1,
    name: 'Bloomberg TV US',
    stream_type: 'live',
    stream_id: 101,
    stream_icon: '',
    category_id: 'news',
    tv_archive: 0,
    tv_archive_duration: 0,
    direct_source: 'https://bloomberg.com/media-manifest/streams/us.m3u8',
    currentProgram: 'Live programming',
  },
  {
    num: 2,
    name: 'Bloomberg TV+',
    stream_type: 'live',
    stream_id: 102,
    stream_icon: '',
    category_id: 'news',
    tv_archive: 0,
    tv_archive_duration: 0,
    direct_source: 'https://bloomberg.com/media-manifest/streams/phoenix-us.m3u8',
    currentProgram: 'Live programming',
  },
  {
    num: 3,
    name: 'France 24 English',
    stream_type: 'live',
    stream_id: 103,
    stream_icon: '',
    category_id: 'news',
    tv_archive: 0,
    tv_archive_duration: 0,
    direct_source: 'https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_900.m3u8',
    currentProgram: 'Live programming',
  },
  {
    num: 4,
    name: 'Apple HLS Reference Stream',
    stream_type: 'live',
    stream_id: 104,
    stream_icon: '',
    category_id: 'test',
    tv_archive: 0,
    tv_archive_duration: 0,
    direct_source: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8',
    currentProgram: 'Playback reference',
  },
];

export const DEMO_VOD_CATEGORIES: XtreamCategory[] = [
  { category_id: 'all', category_name: '⭐ All Movies' },
  { category_id: 'action', category_name: '💥 Action & Thriller' },
  { category_id: 'scifi', category_name: '🚀 Sci-Fi & Cyberpunk' },
  { category_id: 'drama', category_name: '🎭 Drama & Award Winners' },
  { category_id: 'animation', category_name: '✨ Animation & Family' },
];

export const DEMO_VOD_STREAMS: XtreamVodStream[] = [
  {
    num: 1,
    name: 'Cyberpunk 2099: Neon Syndicate',
    stream_type: 'movie',
    stream_id: 501,
    stream_icon: '/src/assets/images/movie_backdrop_cyberpunk_1791054521126.jpg',
    rating: '8.9',
    rating_5based: 4.5,
    added: '1704067200',
    category_id: 'scifi',
    container_extension: 'mp4',
    year: '2025',
    plot: 'In a dystopian high-altitude megalopolis, an augmented cyber-detective uncovers an underworld neural conspiracy that threatens the city core power grid.',
    duration: '1h 58m',
    direct_source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  },
  {
    num: 2,
    name: 'Interstellar Horizons: The Deep Sector',
    stream_type: 'movie',
    stream_id: 502,
    stream_icon: '/src/assets/images/iptv_hero_banner_1791054500017.jpg',
    rating: '9.2',
    rating_5based: 4.8,
    added: '1704067200',
    category_id: 'scifi',
    container_extension: 'mp4',
    year: '2026',
    plot: 'When deep space probes detect a rhythmic electromagnetic signal from an uncharted dwarf galaxy, a specialized crew embarks on humanity’s furthest exploratory jump.',
    duration: '2h 24m',
    direct_source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
  {
    num: 3,
    name: 'Champions Night: The Wembley Climax',
    stream_type: 'movie',
    stream_id: 503,
    stream_icon: '/src/assets/images/sports_event_backdrop_1791054510263.jpg',
    rating: '8.4',
    rating_5based: 4.2,
    added: '1704067200',
    category_id: 'action',
    container_extension: 'mp4',
    year: '2026',
    plot: 'An all-access behind-the-scenes documentary chronicle of the most electric football tournament final in modern European sporting history.',
    duration: '1h 45m',
    direct_source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
  },
  {
    num: 4,
    name: 'Sintel: The Dragon Master',
    stream_type: 'movie',
    stream_id: 504,
    stream_icon: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&auto=format&fit=crop&q=80',
    rating: '8.7',
    rating_5based: 4.4,
    added: '1704067200',
    category_id: 'animation',
    container_extension: 'mp4',
    year: '2024',
    plot: 'A lonely young warrior travels across treacherous mountain wastes in search of Scales, the baby dragon she rescued and raised as her companion.',
    duration: '1h 32m',
    direct_source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
  {
    num: 5,
    name: 'Big Buck Bunny: Forest Uprising',
    stream_type: 'movie',
    stream_id: 505,
    stream_icon: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=400&auto=format&fit=crop&q=80',
    rating: '8.1',
    rating_5based: 4.0,
    added: '1704067200',
    category_id: 'animation',
    container_extension: 'mp4',
    year: '2023',
    plot: 'A gentle giant rabbit decides he has endured enough torment from three bullying woodland rodents and devises a series of clever medieval forest traps.',
    duration: '1h 15m',
    direct_source: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
  },
  {
    num: 6,
    name: 'Tears of Steel: Amsterdam 2049',
    stream_type: 'movie',
    stream_id: 506,
    stream_icon: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&auto=format&fit=crop&q=80',
    rating: '7.9',
    rating_5based: 3.9,
    added: '1704067200',
    category_id: 'scifi',
    container_extension: 'mp4',
    year: '2024',
    plot: 'A team of underground warriors and brain-augmented scientists stage a desperate tactical ambush in the ruins of the Oude Kerk.',
    duration: '1h 22m',
    direct_source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  },
];

export const DEMO_SERIES_CATEGORIES: XtreamCategory[] = [
  { category_id: 'all', category_name: '⭐ All Series' },
  { category_id: 'scifi', category_name: '🚀 Sci-Fi & Cyberpunk' },
  { category_id: 'crime', category_name: '🕵️ Crime & Detective' },
  { category_id: 'nature', category_name: '🌿 Nature & Exploration' },
];

export const DEMO_SERIES_LIST: XtreamSeries[] = [
  {
    num: 1,
    name: 'Nebula Chronicles',
    series_id: 801,
    cover: '/src/assets/images/iptv_hero_banner_1791054500017.jpg',
    plot: 'Following the commanders of Deep Relay Station 9 as they decipher first-contact subspace transmissions at the threshold of the Milky Way.',
    cast: 'Elena Vance, Marcus Thorne, David Chen',
    director: 'Cynthia Valerius',
    genre: 'Sci-Fi / Space Mystery',
    releaseDate: '2025',
    rating: '9.3',
    rating_5based: 4.7,
    episode_run_time: '48m',
    category_id: 'scifi',
  },
  {
    num: 2,
    name: 'Metropolis: Sector 11',
    series_id: 802,
    cover: '/src/assets/images/movie_backdrop_cyberpunk_1791054521126.jpg',
    plot: 'A hardboiled tactical investigator and a rogue synthetics programmer untangle a corrupt corporate monopoly manipulating city memory banks.',
    cast: 'Kenji Sato, Rachel Cross, Thomas Vance',
    director: 'Lucian Moreau',
    genre: 'Cyberpunk / Neo-Noir',
    releaseDate: '2026',
    rating: '8.8',
    rating_5based: 4.4,
    episode_run_time: '52m',
    category_id: 'crime',
  },
  {
    num: 3,
    name: 'Wild Planet 4K: Earth Secrets',
    series_id: 803,
    cover: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&auto=format&fit=crop&q=80',
    plot: 'High-speed cinematic journeys across remote hydrothermal vents, uncharted Amazonian canopies, and sub-glacial caverns.',
    cast: 'Narrated by Sir James Sterling',
    director: 'Claire Beaumont',
    genre: 'Documentary / Nature',
    releaseDate: '2024',
    rating: '9.5',
    rating_5based: 4.9,
    episode_run_time: '55m',
    category_id: 'nature',
  },
];

export const DEMO_SERIES_SEASONS: Record<number, XtreamSeason[]> = {
  801: [
    {
      season_num: 1,
      name: 'Season 1: Subspace Awakening',
      episodes: [
        {
          id: '801_1',
          episode_num: 1,
          title: 'Pilot: The Signal of Station 9',
          container_extension: 'mp4',
          video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
          info: {
            plot: 'Relay Station 9 registers an anomalous pulse originating from an extinct binary star cluster.',
            duration: '48m',
            rating: 9.1,
          },
        },
        {
          id: '801_2',
          episode_num: 2,
          title: 'Episode 2: Quantum Echoes',
          container_extension: 'mp4',
          video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
          info: {
            plot: 'Chief Engineer Chen isolates a harmonic frequency that mimics human brainwave resonance.',
            duration: '45m',
            rating: 9.0,
          },
        },
        {
          id: '801_3',
          episode_num: 3,
          title: 'Episode 3: The Event Boundary',
          container_extension: 'mp4',
          video_url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
          info: {
            plot: 'An unscheduled automated transport arrives from deep void with its crew compartments locked in cryo-stasis.',
            duration: '50m',
            rating: 9.4,
          },
        },
      ],
    },
    {
      season_num: 2,
      name: 'Season 2: Convergence Vector',
      episodes: [
        {
          id: '801_4',
          episode_num: 1,
          title: 'Episode 1: The Dark Gate',
          container_extension: 'mp4',
          video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          info: {
            plot: 'The station shields face gravitational shearing as an ancient artificial vortex stabilizes.',
            duration: '52m',
            rating: 9.5,
          },
        },
        {
          id: '801_5',
          episode_num: 2,
          title: 'Episode 2: Synthesis Protocol',
          container_extension: 'mp4',
          video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
          info: {
            plot: 'Elena risks direct neural interface to negotiate with the alien harmonic intelligence.',
            duration: '49m',
            rating: 9.6,
          },
        },
      ],
    },
  ],
  802: [
    {
      season_num: 1,
      name: 'Season 1: Neon Syndicate',
      episodes: [
        {
          id: '802_1',
          episode_num: 1,
          title: 'Episode 1: Ghost in the Conduit',
          container_extension: 'mp4',
          video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
          info: {
            plot: 'Detective Sato investigates a blackout in District 4 where digital memories were wiped.',
            duration: '51m',
            rating: 8.9,
          },
        },
        {
          id: '802_2',
          episode_num: 2,
          title: 'Episode 2: Black Market Synapse',
          container_extension: 'mp4',
          video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
          info: {
            plot: 'Underground cybernetic clinics are raided after contaminated neural implants surface.',
            duration: '47m',
            rating: 8.7,
          },
        },
      ],
    },
  ],
};

// Generates dynamic real-time EPG program schedules around the current local clock
export function generateDemoEPG(streamId: number): XtreamEPGProgramme[] {
  const now = new Date();
  const currentDay = now.toISOString().split('T')[0];
  const slotStart = new Date(now);
  slotStart.setMinutes(0, 0, 0);

  const labels =
    streamId === 104
      ? ['Playback reference', 'Playback reference', 'Playback reference']
      : ['Live programming', 'Schedule unavailable', 'Schedule unavailable'];

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  return labels.map((title, index) => {
    const startTime = new Date(slotStart.getTime() + index * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    return {
      id: `${streamId}_guide_${index}`,
      channel_id: String(streamId),
      title,
      description:
        streamId === 104
          ? 'Official Apple HLS sample used to verify player behavior.'
          : 'Program schedule data is not supplied by this development source.',
      start: `${currentDay} ${formatTime(startTime)}:00`,
      end: `${currentDay} ${formatTime(endTime)}:00`,
      start_timestamp: Math.floor(startTime.getTime() / 1000),
      stop_timestamp: Math.floor(endTime.getTime() / 1000),
    };
  });
}
