// Artworks used across the site, numbered as they appear. Licences that need
// attribution (CC BY / CC BY-SA) are credited in the footnotes on the home page.

export type Artwork = { n: number; title: string; detail: string; credit: string; license: string; href: string };

export const artworks: Artwork[] = [
  {
    n: 1,
    title: "The Creation of Adam",
    detail: "Michelangelo Buonarroti, c. 1511, Sistine Chapel ceiling, Vatican City.",
    credit: "Public domain",
    license: "Public domain",
    href: "https://en.wikipedia.org/wiki/The_Creation_of_Adam",
  },
  {
    n: 2,
    title: "Hermes fastening his sandal",
    detail: "Roman copy of a Greek original of the 4th century BC, Louvre Ma 83.",
    credit: "Photo: Jastrow",
    license: "Public domain",
    href: "https://commons.wikimedia.org/wiki/File:Montalto_Sandalbinder_Louvre_Ma83.jpg",
  },
  {
    n: 3,
    title: "Herakles killing the Lernaean Hydra",
    detail: "After Lysippos, 4th century BC, restored by Alessandro Algardi. Musei Capitolini, Rome.",
    credit: "Photo: Sailko",
    license: "CC BY 3.0",
    href: "https://commons.wikimedia.org/wiki/File:Ercole_restaurato_come_uccisore_dell%27idra_di_lernia_(rielab._da_lisippo,_IV_sec),_integraz._di_a._algardi.JPG",
  },
  {
    n: 4,
    title: "Discobolus Lancellotti",
    detail: "Roman copy of a 5th century BC original by Myron. Palazzo Massimo alle Terme, Rome.",
    credit: "Photo: Carole Raddato",
    license: "CC BY-SA 2.0",
    href: "https://commons.wikimedia.org/wiki/File:The_Discobolus_Lancellotti,_Roman_copy_of_a_5th_century_BC_Greek_original_by_Myron,_Hadrianic_period,_Palazzo_Massimo_alle_Terme_(11398129933).jpg",
  },
  {
    n: 5,
    title: "Winged Victory of Samothrace",
    detail: "Nike on the prow of a warship, c. 190 BC. Louvre Ma 2369.",
    credit: "Photo: Shonagon",
    license: "CC0",
    href: "https://commons.wikimedia.org/wiki/File:Victoire_de_Samothrace_-_Musee_du_Louvre_-_20190812.jpg",
  },
  {
    n: 6,
    title: "Apple Vision Pro",
    detail: "Facing left.",
    credit: "Photo: Hay Kranen",
    license: "CC BY 4.0",
    href: "https://commons.wikimedia.org/wiki/File:Vision_Pro_-_Facing_left.jpg",
  },
  {
    n: 7,
    title: "Mac mini (2024)",
    detail: "Front view.",
    credit: "Photo: Seasider53",
    license: "CC BY 4.0",
    href: "https://commons.wikimedia.org/wiki/File:Mac_mini_2024_(cropped).jpg",
  },
  {
    n: 8,
    title: "iPad Air 13-inch (M2)",
    detail: "With Magic Keyboard.",
    credit: "Photo: Kyu3a",
    license: "CC BY-SA 4.0",
    href: "https://commons.wikimedia.org/wiki/File:M2_iPad_Air_13inti.jpg",
  },
];
