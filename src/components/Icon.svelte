<script lang="ts">
  export type IconName =
    | 'document'
    | 'shield'
    | 'lock'
    | 'arrow'
    | 'arrow-up'
    | 'sparkles'
    | 'link'
    | 'check'
    | 'chevron'
    | 'info'
    | 'x'
    | 'flag'
    | 'search'
    | 'clock'
    | 'users'
    | 'eye'
    | 'refresh'
    | 'scale'
    | 'copy'
    | 'print'
    | 'download'
    | 'globe'
    | 'sliders'
    | 'external';
  let {
    name,
    size = 20,
    stroke = 1.7,
  }: { name: IconName; size?: number; stroke?: number } = $props();
  const paths: Record<IconName, string> = {
    document:
      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
    shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z M8 12l3 3 5-6',
    lock: 'M6 10h12a1 1 0 0 1 1 1v9H5v-9a1 1 0 0 1 1-1 M8 10V7a4 4 0 0 1 8 0v3 M12 14v3',
    arrow: 'M4 12h16 M14 6l6 6-6 6',
    'arrow-up': 'M12 20V4 M6 10l6-6 6 6',
    sparkles: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z M20 2v4 M18 4h4',
    link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
    check: 'm5 12 4 4L19 6',
    chevron: 'm6 9 6 6 6-6',
    info: 'M12 8h.01 M12 11v6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    x: 'm6 6 12 12 M6 18 18 6',
    flag: 'M5 22V3 M5 3c4-3 10 3 15 0v11c-5 3-11-3-15 0',
    search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    clock: 'M12 6v6l4 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    users:
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    refresh: 'M20 7a9 9 0 0 0-15-1L2 9 M2 3v6h6 M4 17a9 9 0 0 0 15 1l3-3 M16 15h6v6',
    scale: 'M12 3v18 M7 21h10 M3 7h18 M5 7l-4 7h8z M19 7l-4 7h8z',
    copy: 'M8 8h13v13H8z M16 8V3H3v13h5',
    print: 'M6 9V3h12v6 M6 18H3V9h18v9h-3 M6 14h12v8H6z M17 11h1',
    download: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
    globe: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M2 12h20 M12 2c6 5 6 15 0 20-6-5-6-15 0-20',
    sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 10h6 M9 8h6 M17 16h6',
    external: 'M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={paths[name]} /></svg
>
