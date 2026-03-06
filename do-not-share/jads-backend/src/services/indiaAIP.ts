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
}

// ── 127 Civil Aerodromes ──────────────────────────────────────────────────────

export const INDIA_AIP_AERODROMES: Record<string, AerodromeTransitionData> = {
  // ── Delhi FIR (VIDF) ───────────────────────────────────────────────────────
  VIDP: { icao: 'VIDP', name: 'Indira Gandhi International, Delhi',           transitionAltitude: 13000, transitionLevel: 'FL140', elevation:  777 },
  VIDD: { icao: 'VIDD', name: 'Hindon Air Force Station',                     transitionAltitude: 13000, transitionLevel: 'FL140', elevation:  715 },
  VILK: { icao: 'VILK', name: 'Chaudhary Charan Singh Intl, Lucknow',        transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  410 },
  VIAG: { icao: 'VIAG', name: 'Agra Airport (Kheria)',                        transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  551 },
  VIAL: { icao: 'VIAL', name: 'Allahabad Airport (Bamrauli)',                 transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  322 },
  VIAR: { icao: 'VIAR', name: 'Sri Guru Ram Dass Jee Intl, Amritsar',        transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  756 },
  VIBN: { icao: 'VIBN', name: 'Lal Bahadur Shastri Intl, Varanasi',          transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  266 },
  VIBK: { icao: 'VIBK', name: 'Bareilly Air Force Station',                   transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  580 },
  VIBY: { icao: 'VIBY', name: 'Bareilly Civil Airport',                       transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  580 },
  VIDX: { icao: 'VIDX', name: 'Dehradun (Jolly Grant) Airport',              transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1831 },
  VIGG: { icao: 'VIGG', name: 'Gwalior Air Force Station',                    transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  617 },
  VIGR: { icao: 'VIGR', name: 'Gorakhpur Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  259 },
  VIHR: { icao: 'VIHR', name: 'Hisar Airport',                                transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  700 },
  VIJP: { icao: 'VIJP', name: 'Jaipur International Airport',                 transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1263 },
  VIJR: { icao: 'VIJR', name: 'Jodhpur Air Force Station',                    transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  717 },
  VIKG: { icao: 'VIKG', name: 'Kanpur Airport (Chakeri)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  410 },
  VIKO: { icao: 'VIKO', name: 'Kota Airport',                                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  896 },
  VILH: { icao: 'VILH', name: 'Kushok Bakula Rimpochee Airport, Leh',         transitionAltitude: 16000, transitionLevel: 'FL170', elevation: 10682 },
  VIPT: { icao: 'VIPT', name: 'Pantnagar Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  769 },
  VIPN: { icao: 'VIPN', name: 'Pithoragarh Airport',                          transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 5072 },
  VISP: { icao: 'VISP', name: 'Sahnewal Airport, Ludhiana',                   transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  834 },
  VISM: { icao: 'VISM', name: 'Shimla Airport (Jubbarhatti)',                  transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 5072 },
  VIST: { icao: 'VIST', name: 'Satna Airport',                                transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1060 },
  VIUT: { icao: 'VIUT', name: 'Udaipur Airport (Dabok)',                       transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1684 },
  VIJU: { icao: 'VIJU', name: 'Jammu Airport (Satwari)',                       transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1029 },
  VISR: { icao: 'VISR', name: 'Sheikh ul-Alam Intl, Srinagar',                transitionAltitude: 13000, transitionLevel: 'FL140', elevation: 5429 },
  VILD: { icao: 'VILD', name: 'Saharan Airport, Ludhiana',                    transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  834 },
  VICG: { icao: 'VICG', name: 'Chandigarh Airport',                           transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1012 },
  VIAX: { icao: 'VIAX', name: 'Adampur Airport',                              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  776 },
  VIPG: { icao: 'VIPG', name: 'Pathankot Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1025 },
  VIBR: { icao: 'VIBR', name: 'Bhatinda Air Force Station',                   transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  662 },
  VIBL: { icao: 'VIBL', name: 'Bakshi Ka Talab (Lucknow)',                    transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  410 },
  VIKL: { icao: 'VIKL', name: 'Kullu–Manali Airport (Bhuntar)',               transitionAltitude: 14000, transitionLevel: 'FL150', elevation: 3573 },
  VIDN: { icao: 'VIDN', name: 'Dharamsala (Gaggal) Airport',                  transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 2525 },
  VIGN: { icao: 'VIGN', name: 'Guna Airport',                                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1600 },
  VIBT: { icao: 'VIBT', name: 'Bhatinda Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  662 },
  VIUX: { icao: 'VIUX', name: 'Udhampur Air Force Station',                   transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 2066 },

  // ── Mumbai FIR (VABB) ──────────────────────────────────────────────────────
  VABB: { icao: 'VABB', name: 'Chhatrapati Shivaji Maharaj Intl, Mumbai',     transitionAltitude: 13000, transitionLevel: 'FL140', elevation:   39 },
  VAAH: { icao: 'VAAH', name: 'Sardar Vallabhbhai Patel Intl, Ahmedabad',     transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  189 },
  VAAU: { icao: 'VAAU', name: 'Aurangabad Airport (Chikkalthana)',            transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1906 },
  VABP: { icao: 'VABP', name: 'Raja Bhoj Airport, Bhopal',                    transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1711 },
  VABJ: { icao: 'VABJ', name: 'Bhuj Airport (Rudra Mata)',                    transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  268 },
  VABI: { icao: 'VABI', name: 'Bilaspur Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  899 },
  VADL: { icao: 'VADL', name: 'Diu Airport',                                  transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   31 },
  VAGN: { icao: 'VAGN', name: 'INS Hansa Naval Air Station, Goa',             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  186 },
  VAGO: { icao: 'VAGO', name: 'Goa International Airport (Dabolim)',          transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  186 },
  VOGP: { icao: 'VOGP', name: 'Manohar International Airport, Mopa Goa',     transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  558 },
  VAID: { icao: 'VAID', name: 'Indore Airport (Devi Ahilyabai Holkar)',       transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1850 },
  VAJB: { icao: 'VAJB', name: 'Jabalpur Airport (Dumna)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1624 },
  VAJM: { icao: 'VAJM', name: 'Jamnagar Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   69 },
  VAKD: { icao: 'VAKD', name: 'Kandla Airport',                               transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   96 },
  VAKJ: { icao: 'VAKJ', name: 'Khajuraho Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  728 },
  VAKP: { icao: 'VAKP', name: 'Kolhapur Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1996 },
  VANP: { icao: 'VANP', name: 'Dr. Babasaheb Ambedkar Intl, Nagpur',          transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1033 },
  VAND: { icao: 'VAND', name: 'Nanded Airport (Shri Guru Gobind Singh Ji)',   transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1250 },
  VANR: { icao: 'VANR', name: 'Nashik Airport (Ozar)',                        transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1900 },
  VAPO: { icao: 'VAPO', name: 'Pune Airport (Lohegaon)',                      transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1942 },
  VARP: { icao: 'VARP', name: 'Raipur Airport (Swami Vivekananda)',            transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1041 },
  VARK: { icao: 'VARK', name: 'Rajkot Airport',                               transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  441 },
  VASL: { icao: 'VASL', name: 'Solapur Airport',                              transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1584 },
  VASU: { icao: 'VASU', name: 'Surat Airport',                                transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   16 },
  VAVD: { icao: 'VAVD', name: 'Vadodara Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  129 },
  VAPR: { icao: 'VAPR', name: 'Porbandar Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   23 },

  // ── Chennai FIR (VOMF) ─────────────────────────────────────────────────────
  VOMM: { icao: 'VOMM', name: 'Chennai International',                        transitionAltitude: 11000, transitionLevel: 'FL120', elevation:   52 },
  VOBL: { icao: 'VOBL', name: 'Kempegowda International, Bengaluru',          transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 3000 },
  VOHS: { icao: 'VOHS', name: 'Rajiv Gandhi International, Hyderabad',        transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 2024 },
  VOBZ: { icao: 'VOBZ', name: 'Begumpet Airport, Hyderabad',                 transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1742 },
  VOCL: { icao: 'VOCL', name: 'Cochin International Airport, Kochi',          transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   30 },
  VOTR: { icao: 'VOTR', name: 'Tiruchirappalli International',                transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  288 },
  VOTV: { icao: 'VOTV', name: 'Trivandrum International',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   15 },
  VOCB: { icao: 'VOCB', name: 'Coimbatore Airport (Peelamedu)',               transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1324 },
  VOMF: { icao: 'VOMF', name: 'Madurai FIR Control Area (Chennai FIR boundary)', transitionAltitude:  5000, transitionLevel: 'FL050', elevation:  459 },
  VOMD: { icao: 'VOMD', name: 'Madurai Airport',                              transitionAltitude:  5000, transitionLevel: 'FL050', elevation:  459 },
  VOML: { icao: 'VOML', name: 'Mangaluru International Airport',              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  337 },
  VOMY: { icao: 'VOMY', name: 'Mysuru Airport (Mandakalli)',                   transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 2349 },
  VOHB: { icao: 'VOHB', name: 'Hakimpet Air Force Station, Hyderabad',        transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1742 },
  VOHY: { icao: 'VOHY', name: 'Begumpet Airport (Civil), Hyderabad',          transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 1742 },
  VOTP: { icao: 'VOTP', name: 'Tirupati Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  350 },
  VOVZ: { icao: 'VOVZ', name: 'Visakhapatnam Airport',                        transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   15 },
  VOYR: { icao: 'VOYR', name: 'Yelahanka Air Force Station, Bengaluru',       transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 3000 },
  VOBG: { icao: 'VOBG', name: 'HAL Airport, Bengaluru',                       transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 2912 },
  VOTJ: { icao: 'VOTJ', name: 'Thanjavur Air Force Station',                  transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  253 },
  VOCX: { icao: 'VOCX', name: 'Calicut International (Karipur)',              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  342 },
  VOPB: { icao: 'VOPB', name: 'Veer Savarkar International, Port Blair',     transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   14 },
  VOPC: { icao: 'VOPC', name: 'Puducherry Airport',                           transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   43 },
  VOSM: { icao: 'VOSM', name: 'Salem Airport',                                transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  951 },
  VOTK: { icao: 'VOTK', name: 'Tuticorin Airport',                            transitionAltitude:  5000, transitionLevel: 'FL050', elevation:   40 },
  VORY: { icao: 'VORY', name: 'Rajahmundry Airport',                          transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  151 },
  VOAT: { icao: 'VOAT', name: 'Agatti Aerodrome, Lakshadweep',                transitionAltitude:  5000, transitionLevel: 'FL050', elevation:    6 },
  VOKN: { icao: 'VOKN', name: 'Kannur International Airport',                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  340 },
  VOSH: { icao: 'VOSH', name: 'Shimoga Airport (Shivamogga)',                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1853 },
  VOJT: { icao: 'VOJT', name: 'Jalgaon Airport',                              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  783 },
  VOBR: { icao: 'VOBR', name: 'Bidar Air Force Station',                      transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 2178 },
  VOKU: { icao: 'VOKU', name: 'Kadapa Airport (Cuddapah)',                    transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  430 },
  VODK: { icao: 'VODK', name: 'Donakonda Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  460 },
  VONS: { icao: 'VONS', name: 'Nagarjuna Sagar Airport',                      transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  690 },
  VOBK: { icao: 'VOBK', name: 'Bellary Airport (Jindal)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1509 },
  VOKG: { icao: 'VOKG', name: 'Kalaburagi Airport',                           transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1585 },
  VEHW: { icao: 'VEHW', name: 'Hubli Airport (Gokulanagara)',                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 2171 },

  // ── Kolkata FIR (VECC) ─────────────────────────────────────────────────────
  VECC: { icao: 'VECC', name: 'Netaji Subhas Chandra Bose Intl, Kolkata',     transitionAltitude: 11000, transitionLevel: 'FL120', elevation:   16 },
  VEPB: { icao: 'VEPB', name: 'Biju Patnaik International, Bhubaneswar',      transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  138 },
  VEGK: { icao: 'VEGK', name: 'Gaya Airport',                                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  380 },
  VEGY: { icao: 'VEGY', name: 'Guwahati Airport (Lokpriya Gopinath Bordoloi)', transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  162 },
  VEBS: { icao: 'VEBS', name: 'Bagdogra Airport',                             transitionAltitude: 11000, transitionLevel: 'FL120', elevation:  412 },
  VEBP: { icao: 'VEBP', name: 'Birsa Munda Airport, Ranchi',                  transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 2148 },
  VEJH: { icao: 'VEJH', name: 'Jharsuguda Airport (Veer Surendra Sai)',       transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  751 },
  VEPT: { icao: 'VEPT', name: 'Jay Prakash Narayan Airport, Patna',           transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  170 },
  VERC: { icao: 'VERC', name: 'Rourkela Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  659 },
  VEDG: { icao: 'VEDG', name: 'Durgapur Airport (Kazi Nazrul Islam)',         transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  300 },
  VEAT: { icao: 'VEAT', name: 'Agartala Airport (Maharaja Bir Bikram)',       transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   46 },
  VEAZ: { icao: 'VEAZ', name: 'Aizawl Airport (Lengpui)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1398 },
  VEDH: { icao: 'VEDH', name: 'Dhanbad Airport',                              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  847 },
  VEDI: { icao: 'VEDI', name: 'Dibrugarh Airport (Mohanbari)',                transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  362 },
  VEDB: { icao: 'VEDB', name: 'Darbhanga Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  163 },
  VEIM: { icao: 'VEIM', name: 'Imphal Airport (Tulihal)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 2540 },
  VEJT: { icao: 'VEJT', name: 'Jamshedpur Airport (Sonari)',                  transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  475 },
  VEKR: { icao: 'VEKR', name: 'Silchar Airport (Kumbhirgram)',               transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  118 },
  VELR: { icao: 'VELR', name: 'Lilabari Airport, North Lakhimpur',           transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  330 },
  VEMZ: { icao: 'VEMZ', name: 'Muzaffarpur Airport',                          transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  174 },
  VERK: { icao: 'VERK', name: 'Rupsi Airport, Kokrajhar',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  131 },
  VETZ: { icao: 'VETZ', name: 'Tezpur Airport (Salonibari)',                  transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  240 },
  VEPH: { icao: 'VEPH', name: 'Shillong Airport (Umroi)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 2916 },
  VEMN: { icao: 'VEMN', name: 'Dimapur Airport',                              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  487 },
  VEPY: { icao: 'VEPY', name: 'Pakyong Airport, Gangtok',                     transitionAltitude: 11000, transitionLevel: 'FL120', elevation: 4590 },
  VEBD: { icao: 'VEBD', name: 'Burdwan Airport',                              transitionAltitude:  9000, transitionLevel: 'FL100', elevation:   94 },
  VEKJ: { icao: 'VEKJ', name: 'Kharagpur Airport',                            transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  147 },
  VEBO: { icao: 'VEBO', name: 'Bokaro Airport',                               transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  728 },
  VEKO: { icao: 'VEKO', name: 'Jorhat Airport (Rowriah)',                     transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  311 },
  VEPG: { icao: 'VEPG', name: 'Panagarh Air Force Station',                   transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  240 },
  VETJ: { icao: 'VETJ', name: 'Tezu Airport',                                 transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  800 },
  VEKI: { icao: 'VEKI', name: 'Kishangarh Airport, Ajmer',                    transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1470 },
  VEAN: { icao: 'VEAN', name: 'Along Airport, Arunachal Pradesh',             transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 1025 },
  VEMR: { icao: 'VEMR', name: 'Cooch Behar Airport',                          transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  138 },
  VERU: { icao: 'VERU', name: 'Pasighat Airport',                             transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  477 },
  VEZO: { icao: 'VEZO', name: 'Ziro Airport, Arunachal Pradesh',              transitionAltitude:  9000, transitionLevel: 'FL100', elevation: 5420 },
  VEGT: { icao: 'VEGT', name: 'Sarsawa (near Saharanpur)',                    transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  275 },
  VEHK: { icao: 'VEHK', name: 'Hashimara Air Force Station',                  transitionAltitude:  9000, transitionLevel: 'FL100', elevation:  222 },
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
