import { useArtistImage } from "@/hooks/useArtistImage";

interface Props {
  artistName: string;
  fallbackUrl: string;
  alt?: string;
  className?: string;
}

/**
 * Renders an artist image that tries to fetch a real photo from MusicBrainz/Wikidata,
 * falling back to the local asset if unavailable.
 */
export default function ArtistImage({ artistName, fallbackUrl, alt, className }: Props) {
  const imageUrl = useArtistImage(artistName, fallbackUrl);

  return (
    <img
      src={imageUrl}
      alt={alt || artistName}
      className={className}
    />
  );
}
