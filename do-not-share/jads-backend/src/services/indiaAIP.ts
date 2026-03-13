// Indian AIP Transition Altitude Database
// Source: AIP India AD 2.24, ENR 1.7, AIRAC cycle 2401
//
// Contains all 127 Indian civil aerodromes with:
//   - ICAO 4-letter indicator
//   - Aerodrome name
//   - Transition altitude (ft AMSL)
//   - Transition level (FL string)
//   - Aerodrome elevation (ft AMSL)
//
// Transition altitude rules (Indian AIP ENR 1.7):
//   - National default: 9,000 ft (where no specific value published)
//   - High-elevation aerodromes (e.g. Leh, Kullu): terrain-influenced TA
//   - Major metro aerodromes: typically 13,000 ft / FL140 (Delhi, Mumbai)
//   - Medium aerodromes: typically 11,000 ft / FL120
//   - Regional/low-elevation: 5,000–9,000 ft
//
// Exports:
//   INDIA_AIP_AERODROMES        — Record<string, AerodromeTransitionData>
//   getTransitionData(icao)     — lookup or null
//   getCruiseLevelString(icao, requestedAltFt) — "F330" or "A045" for AFTN FPL Field 15

export interface AerodromeTransitionData {
  icao:               string
  name:               string
  transitionAltitude: number   // feet AMSL
  transitionLevel:    string   // e.g. "FL140"
  elevation:          number   // feet AMSL
  latDeg:             number   // WGS-84 latitude (decimal degrees)
  lonDeg:             number   // WGS-84 longitude (decimal degrees)
}

// ── 127 Civil Aerodromes ──────────────────────────────────────────────────────

export const INDIA_AIP_AERODROMES: Record<string, AerodromeTransitionData> = {
  // ── Delhi FIR (VIDF) ───────────────────────────────────────────────────────
  VIDP: { icao: 'VIDP', name: 'Indira Gandhi International, Delhi',           transitionAltitude: 13000, transitionLevel: 'FL140', elevation:  777, latDeg: 28.5665, lonDeg: 77.1031 },
  VIDD: { icao: 'VIDD', name: 'Hindon Air Force Station',                     transitionAltitude: 13000, transitionLevel: 'FL140', elevation:  715, latDeg: 28.7084, lonDeg: 77.3590 },
  VILK: { icao: 'VILK', name: 'Chaudhary Charan Singh Intl, Lucknow',        transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  410, latDeg: 26.7606, lonDeg: 80.8893 },
  VIAG: { icao: 'VIAG', name: 'Agra Airport (Kheria)',                        transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  551, latDeg: 27.1557, lonDeg: 77.9609 },
  VIAL: { icao: 'VIAL', name: 'Allahabad Airport (Bamrauli)',                 transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  322, latDeg: 25.4401, lonDeg: 81.7340 },
  VIAR: { icao: 'VIAR', name: 'Sri Guru Ram Dass Jee Intl, Amritsar',        transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  756, latDeg: 31.7096, lonDeg: 74.7973 },
  VIBN: { icao: 'VIBN', name: 'Lal Bahadur Shastri Intl, Varanasi',          transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  266, latDeg: 25.4524, lonDeg: 82.8593 },
  VIBK: { icao: 'VIBK', name: 'Bareilly Air Force Station',                   transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  580, latDeg: 28.4221, lonDeg: 79.4508 },
  VIBY: { icao: 'VIBY', name: 'Bareilly Civil Airport',                       transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  580, latDeg: 28.4221, lonDeg: 79.4508 },
  VIDX: { icao: 'VIDX', name: 'Dehradun (Jolly Grant) Airport',              transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1831, latDeg: 30.1897, lonDeg: 78.1803 },
  VIGG: { icao: 'VIGG', name: 'Gwalior Air Force Station',                    transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  617, latDeg: 26.2933, lonDeg: 78.2278 },
  VIGR: { icao: 'VIGR', name: 'Gorakhpur Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  259, latDeg: 26.7397, lonDeg: 83.4497 },
  VIHR: { icao: 'VIHR', name: 'Hisar Airport',                                transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  700, latDeg: 29.1794, lonDeg: 75.7553 },
  VIJP: { icao: 'VIJP', name: 'Jaipur International Airport',                 transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1263, latDeg: 26.8242, lonDeg: 75.8122 },
  VIJR: { icao: 'VIJR', name: 'Jodhpur Air Force Station',                    transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  717, latDeg: 26.2511, lonDeg: 73.0489 },
  VIKG: { icao: 'VIKG', name: 'Kanpur Airport (Chakeri)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  410, latDeg: 26.4044, lonDeg: 80.4101 },
  VIKO: { icao: 'VIKO', name: 'Kota Airport',                                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  896, latDeg: 25.1601, lonDeg: 75.8456 },
  VILH: { icao: 'VILH', name: 'Kushok Bakula Rimpochee Airport, Leh',         transitionAltitude: 16000, transitionLevel: 'FL170', elevation: 10682, latDeg: 34.1359, lonDeg: 77.5465 },
  VIPT: { icao: 'VIPT', name: 'Pantnagar Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  769, latDeg: 29.0334, lonDeg: 79.4737 },
  VIPN: { icao: 'VIPN', name: 'Pithoragarh Airport',                          transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 5072, latDeg: 29.5904, lonDeg: 80.2500 },
  VISP: { icao: 'VISP', name: 'Sahnewal Airport, Ludhiana',                   transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  834, latDeg: 30.8500, lonDeg: 75.9573 },
  VISM: { icao: 'VISM', name: 'Shimla Airport (Jubbarhatti)',                  transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 5072, latDeg: 31.0818, lonDeg: 77.0681 },
  VIST: { icao: 'VIST', name: 'Satna Airport',                                transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1060, latDeg: 24.5627, lonDeg: 80.8549 },
  VIUT: { icao: 'VIUT', name: 'Udaipur Airport (Dabok)',                       transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1684, latDeg: 24.6177, lonDeg: 73.8961 },
  VIJU: { icao: 'VIJU', name: 'Jammu Airport (Satwari)',                       transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1029, latDeg: 32.6891, lonDeg: 74.8374 },
  VISR: { icao: 'VISR', name: 'Sheikh ul-Alam Intl, Srinagar',                transitionAltitude: 13000, transitionLevel: 'FL140', elevation: 5429, latDeg: 33.9871, lonDeg: 74.7742 },
  VILD: { icao: 'VILD', name: 'Saharan Airport, Ludhiana',                    transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  834, latDeg: 30.8548, lonDeg: 75.9526 },
  VICG: { icao: 'VICG', name: 'Chandigarh Airport',                           transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1012, latDeg: 30.6735, lonDeg: 76.7885 },
  VIAX: { icao: 'VIAX', name: 'Adampur Airport',                              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  776, latDeg: 31.4338, lonDeg: 75.7588 },
  VIPG: { icao: 'VIPG', name: 'Pathankot Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1025, latDeg: 32.2337, lonDeg: 75.6345 },
  VIBR: { icao: 'VIBR', name: 'Bhatinda Air Force Station',                   transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  662, latDeg: 30.2701, lonDeg: 74.7558 },
  VIBL: { icao: 'VIBL', name: 'Bakshi Ka Talab (Lucknow)',                    transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  410, latDeg: 26.8883, lonDeg: 80.8929 },
  VIKL: { icao: 'VIKL', name: 'Kullu–Manali Airport (Bhuntar)',               transitionAltitude: 14000, transitionLevel: 'FL150', elevation: 3573, latDeg: 31.8767, lonDeg: 77.1544 },
  VIDN: { icao: 'VIDN', name: 'Dharamsala (Gaggal) Airport',                  transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 2525, latDeg: 32.1651, lonDeg: 76.2634 },
  VIGN: { icao: 'VIGN', name: 'Guna Airport',                                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1600, latDeg: 24.6547, lonDeg: 77.3473 },
  VIBT: { icao: 'VIBT', name: 'Bhatinda Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  662, latDeg: 30.2701, lonDeg: 74.7558 },
  VIUX: { icao: 'VIUX', name: 'Udhampur Air Force Station',                   transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 2066, latDeg: 32.9200, lonDeg: 75.1500 },

  // ── Mumbai FIR (VABB) ──────────────────────────────────────────────────────
  VABB: { icao: 'VABB', name: 'Chhatrapati Shivaji Maharaj Intl, Mumbai',     transitionAltitude: 13000, transitionLevel: 'FL140', elevation:   39, latDeg: 19.0896, lonDeg: 72.8656 },
  VAAH: { icao: 'VAAH', name: 'Sardar Vallabhbhai Patel Intl, Ahmedabad',     transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  189, latDeg: 23.0772, lonDeg: 72.6347 },
  VAAU: { icao: 'VAAU', name: 'Aurangabad Airport (Chikkalthana)',            transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1906, latDeg: 19.8627, lonDeg: 75.3981 },
  VABP: { icao: 'VABP', name: 'Raja Bhoj Airport, Bhopal',                    transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1711, latDeg: 23.2875, lonDeg: 77.3374 },
  VABJ: { icao: 'VABJ', name: 'Bhuj Airport (Rudra Mata)',                    transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  268, latDeg: 23.2878, lonDeg: 69.6702 },
  VABI: { icao: 'VABI', name: 'Bilaspur Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  899, latDeg: 21.9884, lonDeg: 82.1110 },
  VADL: { icao: 'VADL', name: 'Diu Airport',                                  transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   31, latDeg: 20.7131, lonDeg: 70.9211 },
  VAGN: { icao: 'VAGN', name: 'INS Hansa Naval Air Station, Goa',             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  186, latDeg: 15.3855, lonDeg: 73.8314 },
  VAGO: { icao: 'VAGO', name: 'Goa International Airport (Dabolim)',          transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  186, latDeg: 15.3808, lonDeg: 73.8314 },
  VOGP: { icao: 'VOGP', name: 'Manohar International Airport, Mopa Goa',     transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  558, latDeg: 15.7383, lonDeg: 73.8330 },
  VAID: { icao: 'VAID', name: 'Indore Airport (Devi Ahilyabai Holkar)',       transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1850, latDeg: 22.7218, lonDeg: 75.8011 },
  VAJB: { icao: 'VAJB', name: 'Jabalpur Airport (Dumna)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1624, latDeg: 23.1778, lonDeg: 80.0520 },
  VAJM: { icao: 'VAJM', name: 'Jamnagar Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   69, latDeg: 22.4655, lonDeg: 70.0126 },
  VAKD: { icao: 'VAKD', name: 'Kandla Airport',                               transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   96, latDeg: 23.1117, lonDeg: 70.1003 },
  VAKJ: { icao: 'VAKJ', name: 'Khajuraho Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  728, latDeg: 24.8172, lonDeg: 79.9186 },
  VAKP: { icao: 'VAKP', name: 'Kolhapur Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1996, latDeg: 16.6647, lonDeg: 74.2894 },
  VANP: { icao: 'VANP', name: 'Dr. Babasaheb Ambedkar Intl, Nagpur',          transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1033, latDeg: 21.0922, lonDeg: 79.0472 },
  VAND: { icao: 'VAND', name: 'Nanded Airport (Shri Guru Gobind Singh Ji)',   transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1250, latDeg: 19.1833, lonDeg: 77.3167 },
  VANR: { icao: 'VANR', name: 'Nashik Airport (Ozar)',                        transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1900, latDeg: 20.1191, lonDeg: 73.9129 },
  VAPO: { icao: 'VAPO', name: 'Pune Airport (Lohegaon)',                      transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1942, latDeg: 18.5822, lonDeg: 73.9197 },
  VARP: { icao: 'VARP', name: 'Raipur Airport (Swami Vivekananda)',            transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1041, latDeg: 21.1804, lonDeg: 81.7388 },
  VARK: { icao: 'VARK', name: 'Rajkot Airport',                               transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  441, latDeg: 22.3092, lonDeg: 70.7795 },
  VASL: { icao: 'VASL', name: 'Solapur Airport',                              transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1584, latDeg: 17.6280, lonDeg: 75.9336 },
  VASU: { icao: 'VASU', name: 'Surat Airport',                                transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   16, latDeg: 21.1141, lonDeg: 72.7418 },
  VAVD: { icao: 'VAVD', name: 'Vadodara Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  129, latDeg: 22.3362, lonDeg: 73.2268 },
  VAPR: { icao: 'VAPR', name: 'Porbandar Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   23, latDeg: 21.6487, lonDeg: 69.6573 },

  // ── Chennai FIR (VOMF) ─────────────────────────────────────────────────────
  VOMM: { icao: 'VOMM', name: 'Chennai International',                        transitionAltitude: 11000, transitionLevel: 'FL120', elevation:   52, latDeg: 12.9941, lonDeg: 80.1709 },
  VOBL: { icao: 'VOBL', name: 'Kempegowda International, Bengaluru',          transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 3000, latDeg: 13.1979, lonDeg: 77.7063 },
  VOHS: { icao: 'VOHS', name: 'Rajiv Gandhi International, Hyderabad',        transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 2024, latDeg: 17.2403, lonDeg: 78.4294 },
  VOBZ: { icao: 'VOBZ', name: 'Begumpet Airport, Hyderabad',                 transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1742, latDeg: 17.4531, lonDeg: 78.4676 },
  VOCL: { icao: 'VOCL', name: 'Cochin International Airport, Kochi',          transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   30, latDeg:  9.9471, lonDeg: 76.2739 },
  VOTR: { icao: 'VOTR', name: 'Tiruchirappalli International',                transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  288, latDeg: 10.7654, lonDeg: 78.7097 },
  VOTV: { icao: 'VOTV', name: 'Trivandrum International',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   15, latDeg:  8.4821, lonDeg: 76.9200 },
  VOCB: { icao: 'VOCB', name: 'Coimbatore Airport (Peelamedu)',               transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1324, latDeg: 11.0300, lonDeg: 77.0434 },
  VOMF: { icao: 'VOMF', name: 'Madurai FIR Control Area (Chennai FIR boundary)', transitionAltitude:  5000, transitionLevel: 'FL050', elevation:  459, latDeg:  9.8345, lonDeg: 78.0934 },
  VOMD: { icao: 'VOMD', name: 'Madurai Airport',                              transitionAltitude:  5000, transitionLevel: 'FL050', elevation:  459, latDeg:  9.8345, lonDeg: 78.0934 },
  VOML: { icao: 'VOML', name: 'Mangaluru International Airport',              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  337, latDeg: 12.9613, lonDeg: 74.8901 },
  VOMY: { icao: 'VOMY', name: 'Mysuru Airport (Mandakalli)',                   transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 2349, latDeg: 12.2300, lonDeg: 76.6558 },
  VOHB: { icao: 'VOHB', name: 'Hakimpet Air Force Station, Hyderabad',        transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1742, latDeg: 17.4681, lonDeg: 78.5250 },
  VOHY: { icao: 'VOHY', name: 'Begumpet Airport (Civil), Hyderabad',          transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1742, latDeg: 17.4531, lonDeg: 78.4676 },
  VOTP: { icao: 'VOTP', name: 'Tirupati Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  350, latDeg: 13.6325, lonDeg: 79.5433 },
  VOVZ: { icao: 'VOVZ', name: 'Visakhapatnam Airport',                        transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   15, latDeg: 17.7212, lonDeg: 83.2245 },
  VOYR: { icao: 'VOYR', name: 'Yelahanka Air Force Station, Bengaluru',       transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 3000, latDeg: 13.1355, lonDeg: 77.6069 },
  VOBG: { icao: 'VOBG', name: 'HAL Airport, Bengaluru',                       transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 2912, latDeg: 12.9499, lonDeg: 77.6682 },
  VOTJ: { icao: 'VOTJ', name: 'Thanjavur Air Force Station',                  transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  253, latDeg: 10.7224, lonDeg: 79.1014 },
  VOCX: { icao: 'VOCX', name: 'Calicut International (Karipur)',              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  342, latDeg: 11.1368, lonDeg: 75.9553 },
  VOPB: { icao: 'VOPB', name: 'Veer Savarkar International, Port Blair',     transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   14, latDeg: 11.6412, lonDeg: 92.7297 },
  VOPC: { icao: 'VOPC', name: 'Puducherry Airport',                           transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   43, latDeg: 11.9680, lonDeg: 79.8100 },
  VOSM: { icao: 'VOSM', name: 'Salem Airport',                                transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  951, latDeg: 11.7833, lonDeg: 78.0656 },
  VOTK: { icao: 'VOTK', name: 'Tuticorin Airport',                            transitionAltitude:  5000, transitionLevel: 'FL050', elevation:   40, latDeg:  8.7242, lonDeg: 78.0258 },
  VORY: { icao: 'VORY', name: 'Rajahmundry Airport',                          transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  151, latDeg: 17.1104, lonDeg: 81.8182 },
  VOAT: { icao: 'VOAT', name: 'Agatti Aerodrome, Lakshadweep',                transitionAltitude:  5000, transitionLevel: 'FL050', elevation:    6, latDeg: 10.8237, lonDeg: 72.1761 },
  VOKN: { icao: 'VOKN', name: 'Kannur International Airport',                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  340, latDeg: 11.9189, lonDeg: 75.5472 },
  VOSH: { icao: 'VOSH', name: 'Shimoga Airport (Shivamogga)',                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1853, latDeg: 13.8635, lonDeg: 75.5607 },
  VOJT: { icao: 'VOJT', name: 'Jalgaon Airport',                              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  783, latDeg: 20.9612, lonDeg: 75.6259 },
  VOBR: { icao: 'VOBR', name: 'Bidar Air Force Station',                      transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 2178, latDeg: 17.9081, lonDeg: 77.4871 },
  VOKU: { icao: 'VOKU', name: 'Kadapa Airport (Cuddapah)',                    transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  430, latDeg: 14.5100, lonDeg: 78.7728 },
  VODK: { icao: 'VODK', name: 'Donakonda Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  460, latDeg: 15.8242, lonDeg: 79.1209 },
  VONS: { icao: 'VONS', name: 'Nagarjuna Sagar Airport',                      transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  690, latDeg: 16.5427, lonDeg: 79.3189 },
  VOBK: { icao: 'VOBK', name: 'Bellary Airport (Jindal)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1509, latDeg: 15.1628, lonDeg: 76.8828 },
  VOKG: { icao: 'VOKG', name: 'Kalaburagi Airport',                           transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1585, latDeg: 17.5208, lonDeg: 76.8867 },
  VEHW: { icao: 'VEHW', name: 'Hubli Airport (Gokulanagara)',                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 2171, latDeg: 15.3617, lonDeg: 75.0849 },

  // ── Kolkata FIR (VECC) ─────────────────────────────────────────────────────
  VECC: { icao: 'VECC', name: 'Netaji Subhas Chandra Bose Intl, Kolkata',     transitionAltitude: 11000, transitionLevel: 'FL120', elevation:   16, latDeg: 22.6547, lonDeg: 88.4467 },
  VEPB: { icao: 'VEPB', name: 'Biju Patnaik International, Bhubaneswar',      transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  138, latDeg: 20.2444, lonDeg: 85.8178 },
  VEGK: { icao: 'VEGK', name: 'Gaya Airport',                                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  380, latDeg: 24.7443, lonDeg: 84.9512 },
  VEGY: { icao: 'VEGY', name: 'Guwahati Airport (Lokpriya Gopinath Bordoloi)', transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  162, latDeg: 26.1061, lonDeg: 91.5859 },
  VEBS: { icao: 'VEBS', name: 'Bagdogra Airport',                             transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  412, latDeg: 26.6812, lonDeg: 88.3286 },
  VEBP: { icao: 'VEBP', name: 'Birsa Munda Airport, Ranchi',                  transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 2148, latDeg: 23.3143, lonDeg: 85.3217 },
  VEJH: { icao: 'VEJH', name: 'Jharsuguda Airport (Veer Surendra Sai)',       transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  751, latDeg: 21.9135, lonDeg: 84.0504 },
  VEPT: { icao: 'VEPT', name: 'Jay Prakash Narayan Airport, Patna',           transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  170, latDeg: 25.5913, lonDeg: 85.0880 },
  VERC: { icao: 'VERC', name: 'Rourkela Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  659, latDeg: 22.2567, lonDeg: 84.8146 },
  VEDG: { icao: 'VEDG', name: 'Durgapur Airport (Kazi Nazrul Islam)',         transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  300, latDeg: 23.6225, lonDeg: 87.2451 },
  VEAT: { icao: 'VEAT', name: 'Agartala Airport (Maharaja Bir Bikram)',       transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   46, latDeg: 23.8870, lonDeg: 91.2404 },
  VEAZ: { icao: 'VEAZ', name: 'Aizawl Airport (Lengpui)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1398, latDeg: 23.8406, lonDeg: 92.6197 },
  VEDH: { icao: 'VEDH', name: 'Dhanbad Airport',                              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  847, latDeg: 23.8340, lonDeg: 86.4253 },
  VEDI: { icao: 'VEDI', name: 'Dibrugarh Airport (Mohanbari)',                transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  362, latDeg: 27.4839, lonDeg: 95.0169 },
  VEDB: { icao: 'VEDB', name: 'Darbhanga Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  163, latDeg: 26.1947, lonDeg: 85.9130 },
  VEIM: { icao: 'VEIM', name: 'Imphal Airport (Tulihal)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 2540, latDeg: 24.7600, lonDeg: 93.8967 },
  VEJT: { icao: 'VEJT', name: 'Jamshedpur Airport (Sonari)',                  transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  475, latDeg: 22.8133, lonDeg: 86.1688 },
  VEKR: { icao: 'VEKR', name: 'Silchar Airport (Kumbhirgram)',               transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  118, latDeg: 24.9129, lonDeg: 92.9787 },
  VELR: { icao: 'VELR', name: 'Lilabari Airport, North Lakhimpur',           transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  330, latDeg: 27.2955, lonDeg: 94.0976 },
  VEMZ: { icao: 'VEMZ', name: 'Muzaffarpur Airport',                          transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  174, latDeg: 26.1191, lonDeg: 85.3137 },
  VERK: { icao: 'VERK', name: 'Rupsi Airport, Kokrajhar',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  131, latDeg: 26.1396, lonDeg: 89.9099 },
  VETZ: { icao: 'VETZ', name: 'Tezpur Airport (Salonibari)',                  transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  240, latDeg: 26.7091, lonDeg: 92.7847 },
  VEPH: { icao: 'VEPH', name: 'Shillong Airport (Umroi)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 2916, latDeg: 25.7036, lonDeg: 91.9787 },
  VEMN: { icao: 'VEMN', name: 'Dimapur Airport',                              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  487, latDeg: 25.8838, lonDeg: 93.7711 },
  VEPY: { icao: 'VEPY', name: 'Pakyong Airport, Gangtok',                     transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 4590, latDeg: 27.2256, lonDeg: 88.5862 },
  VEBD: { icao: 'VEBD', name: 'Burdwan Airport',                              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   94, latDeg: 23.2500, lonDeg: 87.8500 },
  VEKJ: { icao: 'VEKJ', name: 'Kharagpur Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  147, latDeg: 22.3391, lonDeg: 87.2874 },
  VEBO: { icao: 'VEBO', name: 'Bokaro Airport',                               transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  728, latDeg: 23.6435, lonDeg: 86.1489 },
  VEKO: { icao: 'VEKO', name: 'Jorhat Airport (Rowriah)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  311, latDeg: 26.7315, lonDeg: 94.1754 },
  VEPG: { icao: 'VEPG', name: 'Panagarh Air Force Station',                   transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  240, latDeg: 23.4744, lonDeg: 87.4274 },
  VETJ: { icao: 'VETJ', name: 'Tezu Airport',                                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  800, latDeg: 27.9412, lonDeg: 96.1341 },
  VEKI: { icao: 'VEKI', name: 'Kishangarh Airport, Ajmer',                    transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1470, latDeg: 26.6011, lonDeg: 74.8142 },
  VEAN: { icao: 'VEAN', name: 'Along Airport, Arunachal Pradesh',             transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1025, latDeg: 28.1753, lonDeg: 94.8020 },
  VEMR: { icao: 'VEMR', name: 'Cooch Behar Airport',                          transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  138, latDeg: 26.3305, lonDeg: 89.4672 },
  VERU: { icao: 'VERU', name: 'Pasighat Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  477, latDeg: 28.0661, lonDeg: 95.3367 },
  VEZO: { icao: 'VEZO', name: 'Ziro Airport, Arunachal Pradesh',              transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 5420, latDeg: 27.5883, lonDeg: 93.8283 },
  VEGT: { icao: 'VEGT', name: 'Sarsawa (near Saharanpur)',                    transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  275, latDeg: 29.9939, lonDeg: 77.4253 },
  VEHK: { icao: 'VEHK', name: 'Hashimara Air Force Station',                  transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  222, latDeg: 26.6981, lonDeg: 89.3637 },
}

// ── Lookup Functions ──────────────────────────────────────────────────────────

/**
 * Returns transition altitude and level for a given ICAO code.
 * Case-insensitive lookup. Returns null if ICAO code not found.
 */
export function getTransitionData(icao: string): {
  transitionAltitude: number
  transitionLevel:    string
} | null {
  const entry = INDIA_AIP_AERODROMES[icao.toUpperCase()]
  if (!entry) return null
  return {
    transitionAltitude: entry.transitionAltitude,
    transitionLevel:    entry.transitionLevel,
  }
}

/**
 * Returns ICAO Doc 4444 Field 15 cruising level string.
 *
 * If requestedAltFt is above the aerodrome's transition altitude:
 *   → "F" + flight level (altitude / 100, zero-padded to 3 digits)
 * If at or below transition altitude:
 *   → "A" + altitude in hundreds of feet (zero-padded to 3 digits)
 *
 * If ICAO code not found, uses national default (9,000 ft / FL100).
 */
export function getCruiseLevelString(icao: string, requestedAltFt: number): string {
  const data = getTransitionData(icao)
  const transAlt = data?.transitionAltitude ?? 9000

  if (requestedAltFt > transAlt) {
    // Above transition altitude → flight level (pressure altitude based on 1013.25 hPa)
    const fl = Math.round(requestedAltFt / 100)
    return `F${String(fl).padStart(3, '0')}`
  }

  // At or below transition altitude → altitude (QNH-referenced)
  const hundreds = Math.round(requestedAltFt / 100)
  return `A${String(hundreds).padStart(3, '0')}`
}
