// Applies staged .datc64 files into the game's Bundles2 index.
// Reads/recompresses bundles via Oodle, so oo2core_9_win64.dll must sit next
// to this executable (it is loaded by the name "oo2core").
//
//   ApplyPolish <path to Bundles2/_.index.bin> <stagingRoot>
//
// stagingRoot mirrors in-game paths, e.g. stagingRoot/Data/Balance/German/ClientStrings.datc64
using Index = LibBundle3.Index;

if (args.Length < 2) {
    Console.WriteLine("Usage: ApplyPolish <Bundles2/_.index.bin> <stagingRoot>");
    Console.WriteLine("  stagingRoot contains Data/Balance/German/*.datc64");
    return 1;
}

string indexPath = args[0];
string stagingRoot = Path.GetFullPath(args[1]);
if (!File.Exists(indexPath)) { Console.Error.WriteLine("Index not found: " + indexPath); return 1; }
if (!Directory.Exists(stagingRoot)) { Console.Error.WriteLine("Staging not found: " + stagingRoot); return 1; }

// .datc64 = translated tables; .csd = stat-description files (skill/passive stat lines).
var staged = Directory.EnumerateFiles(stagingRoot, "*.*", SearchOption.AllDirectories)
    .Where(f => f.EndsWith(".datc64", StringComparison.OrdinalIgnoreCase)
             || f.EndsWith(".csd", StringComparison.OrdinalIgnoreCase))
    .ToArray();
if (staged.Length == 0) { Console.Error.WriteLine("No .datc64/.csd files under " + stagingRoot); return 1; }

Console.WriteLine($"Index:   {indexPath}");
Console.WriteLine($"Staging: {stagingRoot}  ({staged.Length} files)");

try {
    using var index = new Index(indexPath, false);

    int replaced = 0, missing = 0;
    foreach (var disk in staged) {
        // in-game path = staged path relative to stagingRoot, forward slashes.
        string rel = Path.GetRelativePath(stagingRoot, disk).Replace('\\', '/');
        // saveIndex:false -> defer the (expensive) index/bundle save to one call at the end.
        int n = Index.Replace(index, rel, disk, null, saveIndex: false);
        if (n > 0) { replaced++; Console.WriteLine("  + " + rel); }
        else { missing++; Console.Error.WriteLine("  ! not in index: " + rel); }
    }

    if (replaced > 0) {
        Console.WriteLine("Saving index (recompressing modified bundles)…");
        index.Save();
    }
    Console.WriteLine($"Done. Replaced {replaced}, skipped {missing}.");
    return 0;
} catch (DllNotFoundException) {
    Console.Error.WriteLine();
    Console.Error.WriteLine("ERROR: oo2core native library not found.");
    Console.Error.WriteLine("Place oo2core_9_win64.dll next to ApplyPolish.exe and retry.");
    return 2;
}
