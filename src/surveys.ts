import { addDays, addMonths, differenceInMonths, format } from 'date-fns'

/** Parent part ("Szülői kérdőív") of the védőnő screening forms, koragyermekkor.hu. The 3-month form has no parent part. */
export type Answer = 'yes' | 'some' | 'no'
export const ANSWERS: [Answer, string][] = [['yes', 'Igen, rendszeresen'], ['some', 'Néha'], ['no', 'Még nem']]

type Q = [text: string, hint?: string]
export const SURVEYS: { month: number; title: string; questions: Q[] }[] = [
  { month: 1, title: '1 hónapos kor', questions: [
    ['Hason fekve, fejét rövid időre megemeli, majd átfordítja mindkét oldalra?'],
    ['Egyforma gyakorisággal mozgatja-e mind a négy végtagját?'],
    ['Nyugodt állapotban erős hangra összerezzen?', 'ajtócsapódás, kulcsleesés, tüsszentés stb.'],
    ['Erős fényre hunyorog?', 'lámpa felkapcsolása, napfény'],
    ['Alkalomtól függően (éhség, fáradtság, fájdalom stb.) megváltozik-e a sírás módja?'],
    ['Szoptatással (táplálással), ringatással, énekléssel, simogatással megnyugtatható?'],
    ['Megfelelően szopik, vagy jól eszik cumisüvegből? Nem csurgat, nem köhécsel?', 'Azaz ajkak, vagy közvetlen környékük érintésére kinyitja-e száját, majd szopáskor ütemesen szívó-nyelő mozgást végez?'],
    ['Kezd-e kialakulni rendszer a mindennapi tevékenységében?', 'Közel azonos időben való ébredés, alvás, étkezés.'],
  ] },
  { month: 2, title: '2 hónapos kor', questions: [
    ['Háton fekve fejét mindkét irányba forgatja?'],
    ['Hason fekve fejét megemelve mindkét irányba elfordítja?'],
    ['Közeli – 25-30 cm-re lévő – arcra, játékra felfigyel?'],
    ['Arca előtt lassan mozduló játék után néz?'],
    ['Beszédhangra akkor is felfigyel, ha a közelében lévő beszélő arcát nem látja?', 'Pl.: a sírást abbahagyja vagy nyugodt állapotban beszédhangra élénk végtagmozgásokba kezd.'],
    ['Ökölben lévő kezeit nyitogatja, azaz ujjait mindkét kezén egyformán nyújtogatja?'],
    ['Háton fekve kezeit észreveszi?'],
    ['Elnyújtott hangzókkal gőgicsél?', 'Pl.: óóó, ááá, gííí, hemmmm'],
    ['Ha beszél hozzá, szokott visszagőgicsélni?'],
    ['Mosolyra mosollyal válaszol?', 'Azaz nyugodt állapotban visszamosolyog, ha mi rámosolygunk?'],
    ['Amikor az anya mellét vagy a cumisüveget látja, van-e jele annak, hogy tudja: most evés következik?', 'Pl.: nyugtalanul kapálózik végtagjaival vagy éppen türelmetlenül, sürgetően gőgicsél?'],
    ['Éjszaka többet alszik, mint nappal?'],
  ] },
  { month: 4, title: '4 hónapos kor', questions: [
    ['Ha hasra fekteti, fejét felemelve, alkarján támaszkodik?'],
    ['Hátáról az oldalára fordul?'],
    ['Hason fekve a körülötte lévő játékért hol az egyik, hol a másik kezével egyformán nyúl?'],
    ['Tekintetével és fejfordítással minden irányba követi a mozgó tárgyat?', 'Azaz oldalra, fel- és lefelé egyaránt képes erre?'],
    ['Kezeit középen összefogva szájához viszi?'],
    ['Háton fekve vagy félig ülő helyzetben tartva a középről nyújtott tárgyakért mindkét kézzel egyformán nyúl?'],
    ['Mindkét kezével egyformán markolászik?', 'pl.: hajat, ruhát vagy takarót'],
    ['A kezébe adott csörgőt megtartja, és bizonyos idő után mindkét keze el tudja engedni?'],
    ['Mosolyog vagy hangot ad annak érdekében, hogy ráfigyeljenek?'],
    ['Hason fekve 10-15 percet önállóan eljátszik?'],
    ['Ébren, nyugalomban külső inger (pl. hirtelen zaj, gyors közeli mozdulat, érintés) nélkül is gyakran összerezzen?'],
    ['Hason fekve az oldalról nyújtott játékért a másik kezével átnyúl?', 'Azaz a jobbról nyújtott tárgyat is csak bal kezével fogja meg vagy fordítva?'],
  ] },
  { month: 6, title: '6 hónapos kor', questions: [
    ['Mindkét irányba forog?', 'Azaz hasról hátra, ill. hátról hasra?'],
    ['Háton fekve mindkét lábfejével játszik?', 'Pl. megfogja vagy akár szájába veszi azokat?'],
    ['Hason fekve, mellkasát is felemelve, mindkét karjával nyújtott könyökkel, mindkét kezével nyitott tenyerére rá tud támaszkodni?'],
    ['A hangok forrását odafordulással keresi?'],
    ['Az apró tárgyakat (pl. szösz, morzsa, mazsolaszemek stb.) is észreveszi?', 'Pl. nézegeti, kezével odanyúl, markolássza?'],
    ['Párbeszédszerű hangadásba bevonható?', 'Azaz hallgat, amikor beszélnek hozzá és hangokat ad, amikor a felnőtt elhallgat?'],
    ['A játékot egyik kezéből a másikba átveszi?'],
    ['Az elejtett tárgyat visszaveszi a kezébe?'],
    ['„Kukucs-játéknál” a fejére borított kendőt leveszi?'],
    ['Mosolyogva vagy nevetve élvezi a felnőttel a közös játékot?', 'Pl.: „kukucs”-játéknál'],
    ['Élvezi a hangadást, hosszasan játszik a saját hangjával?', 'Azaz 2-3 különböző hangból álló szótagokat dallamosan ejt – pl. „mba, ábűű, pamááá, adu geee, gaaaj habűűű” változó hangerővel stb.'],
    ['A szülő mozdulattal kísért hívását megérti?', 'Pl.: a szülő „gyere” szólítására és intésére teste, karja a felnőtt felé lendül?'],
  ] },
  { month: 9, title: '9 hónapos kor', questions: [
    ['Önállóan felül?'],
    ['Kúszva vagy mászva helyet változtat?'],
    ['Négykézláb rugózik („kutyázik”)?'],
    ['Leeső játéknak, tárgynak utána néz?'],
    ['Két tárgyat (pl.: játékot) megfog és egymással összeütöget?'],
    ['A játékot eldobálva, várja, hogy visszakapja?'],
    ['Ülve, támaszkodás nélkül játszik?', 'Azaz nem görnyed előre, nem támaszkodik a széttett lába közé, vagy a combjaira'],
    ['Ismételget szótagokat?', 'pl.: „ba-ba-ba, ma-ma-ma, te-te-te”'],
    ['Mozdulattal kísért, egyszerű utasításokat megért?', 'Pl. „Kérem!” „Nem szabad!” „Add a kezed!” „Gyere ide!” „tapsi-tapsi”, „pá-pá”'],
    ['Idegenekkel másként viselkedik, mint az ismerősökkel?', 'Pl. tartózkodó, visszahúzódik, bizalmatlanul néz, sírva fakad?'],
    ['Tükörképét élvezettel nézegeti?', 'Pl.: a tükröt tapogatja, grimaszol, mosolyog, hangot ad?'],
    ['Tányérjából, darabos ételt önállóan eszik, majszol?', 'Pl. falatkát, kekszet, kenyérhéjat próbál rágni?'],
  ] },
  { month: 12, title: '1 éves kor', questions: [
    ['Bútorok mellett kapaszkodva, önállóan feláll?', '„Még nem” a válasz, ha csak segítséggel felállítva képes megállni.'],
    ['Álló helyzetből, a földön lévő játékot felveszi?', 'Közben bútorba, falba kapaszkodhat vagy támaszkodhat egyik kezével.'],
    ['Bútor/fal mellett oldalazva lépeget?'],
    ['Gyorsan és célirányosan mászik?'],
    ['Dobozból (vagy tálból, fiókból) játékokat (vagy más tárgyakat) kipakol?'],
    ['Apró tárgyat hüvelyk és mutató ujjával felcsippent?', 'Pl. morzsát, szöszt'],
    ['Utánozza a látott mozdulatokat?', 'Pl. tapsi-tapsi, pá-pá'],
    ['Kérésre, de anélkül, hogy Ön segítené, ismerős tárgyakra rámutat?', 'Azaz Ön nem mutat, és nem néz rá a tárgyra, és úgy kérdezi pl.: Hol van a labda, lámpa, maci? stb.'],
    ['Ha valamit szeretne megkapni, amit nem ér el, akkor mutatóujjával rámutat a tárgyra?'],
    ['Iváskor a poharat döntve megtartja?', 'Még mellé csuroghat az ital.'],
    ['Öltöztetésnél segít?', 'Pl.: Amikor a kezét a ruha ujjába illesztik, igyekszik átdugni, fölemeli a lábát a cipő, zokni vagy a nadrágszár fölhúzásához'],
    ['Ha nevén szólítják, akkor odafordulva a kérdező szemébe néz?'],
  ] },
]

/** A form is due from a week before its month of age (time to prepare) until a week before the next month. */
const PREP_DAYS = 7
export const dueSurvey = (birthDate: string, now: number) => {
  const months = differenceInMonths(addDays(now, PREP_DAYS), new Date(birthDate + 'T00:00'))
  return SURVEYS.find(s => s.month === months)
}
export const dueFrom = (birthDate: string, month: number) =>
  format(addDays(addMonths(new Date(birthDate + 'T00:00'), month), -PREP_DAYS), 'yyyy-MM-dd')

export const answeredCount = (answers: (Answer | null)[] = []) => answers.filter(Boolean).length
