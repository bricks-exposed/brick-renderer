export const TestFile = {
  "8\\4-4edge.dat": `
    0 Circle 1.0
    0 Name: 8\\4-4edge.dat
    0 Author: Philippe Hurbain [Philo]
    0 !LDRAW_ORG 8_Primitive UPDATE 2016-01
    0 !LICENSE Licensed under CC BY 4.0 : see CAreadme.txt

    0 BFC CERTIFY CCW

    0 !HISTORY 2016-12-31 [PTadmin] Official Update 2016-01


    2 24 1 0 0 0.7071 0 0.7071
    2 24 0.7071 0 0.7071 0 0 1
    2 24 0 0 1 -0.7071 0 0.7071
    2 24 -0.7071 0 0.7071 -1 0 0
    2 24 -1 0 0 -0.7071 0 -0.7071
    2 24 -0.7071 0 -0.7071 0 0 -1
    2 24 0 0 -1 0.7071 0 -0.7071
    2 24 0.7071 0 -0.7071 1 0 0
    0 // Build by Primitive Generator 2
    `,

  "8\\4-4cyli.dat": `
    0 Cylinder 1.0
    0 Name: 8\\4-4cyli.dat
    0 Author: Philippe Hurbain [Philo]
    0 !LDRAW_ORG 8_Primitive UPDATE 2016-01
    0 !LICENSE Licensed under CC BY 4.0 : see CAreadme.txt

    0 BFC CERTIFY CCW

    0 !HISTORY 2016-12-31 [PTadmin] Official Update 2016-01


    4 16 0.7071 0 0.7071 1 0 0 1 1 0 0.7071 1 0.7071
    4 16 0 0 1 0.7071 0 0.7071 0.7071 1 0.7071 0 1 1
    4 16 -0.7071 0 0.7071 0 0 1 0 1 1 -0.7071 1 0.7071
    4 16 -1 0 0 -0.7071 0 0.7071 -0.7071 1 0.7071 -1 1 0
    4 16 -0.7071 0 -0.7071 -1 0 0 -1 1 0 -0.7071 1 -0.7071
    4 16 0 0 -1 -0.7071 0 -0.7071 -0.7071 1 -0.7071 0 1 -1
    4 16 0.7071 0 -0.7071 0 0 -1 0 1 -1 0.7071 1 -0.7071
    4 16 1 0 0 0.7071 0 -0.7071 0.7071 1 -0.7071 1 1 0
    0 // conditional lines
    5 24 1 1 0 1 0 0 0.7071 1 -0.7071 0.7071 1 0.7071
    5 24 0.7071 1 0.7071 0.7071 0 0.7071 1 1 0 0 1 1
    5 24 0 1 1 0 0 1 0.7071 1 0.7071 -0.7071 1 0.7071
    5 24 -0.7071 1 0.7071 -0.7071 0 0.7071 0 1 1 -1 1 0
    5 24 -1 1 0 -1 0 0 -0.7071 1 0.7071 -0.7071 1 -0.7071
    5 24 -0.7071 1 -0.7071 -0.7071 0 -0.7071 -1 1 0 0 1 -1
    5 24 0 1 -1 0 0 -1 -0.7071 1 -0.7071 0.7071 1 -0.7071
    5 24 0.7071 1 -0.7071 0.7071 0 -0.7071 0 1 -1 1 1 0
    0 // Build by Primitive Generator 2`,

  "8\\4-4disc.dat": `
    0 Disc 1.0
    0 Name: 8\\4-4disc.dat
    0 Author: Philippe Hurbain [Philo]
    0 !LDRAW_ORG 8_Primitive UPDATE 2016-01
    0 !LICENSE Licensed under CC BY 4.0 : see CAreadme.txt

    0 BFC CERTIFY CCW

    0 !HISTORY 2016-12-31 [PTadmin] Official Update 2016-01


    3 16 0 0 0 1 0 0 0.7071 0 0.7071
    3 16 0 0 0 0.7071 0 0.7071 0 0 1
    3 16 0 0 0 0 0 1 -0.7071 0 0.7071
    3 16 0 0 0 -0.7071 0 0.7071 -1 0 0
    3 16 0 0 0 -1 0 0 -0.7071 0 -0.7071
    3 16 0 0 0 -0.7071 0 -0.7071 0 0 -1
    3 16 0 0 0 0 0 -1 0.7071 0 -0.7071
    3 16 0 0 0 0.7071 0 -0.7071 1 0 0
    0 // Build by Primitive Generator 2`,

  "stud.dat": `
    0 Stud (Fast-Draw)
    0 Name: 8\stud.dat
    0 Author: James Jessiman
    0 !LDRAW_ORG 8_Primitive UPDATE 2016-01
    0 !LICENSE Licensed under CC BY 4.0 : see CAreadme.txt

    0 BFC CERTIFY CCW

    0 !HISTORY 2002-04-04 [sbliss] Modified for BFC compliance; compacted code
    0 !HISTORY 2002-04-25 [PTadmin] Official Update 2002-02
    0 !HISTORY 2007-06-24 [PTadmin] Header formatted for Contributor Agreement
    0 !HISTORY 2008-07-01 [PTadmin] Official Update 2008-01
    0 !HISTORY 2012-02-16 [Philo] Changed to CCW
    0 !HISTORY 2012-03-30 [PTadmin] Official Update 2012-01
    0 !HISTORY 2013-12-23 [PTadmin] Official Update 2013-02
    0 !HISTORY 2016-01-04 [Philo] Used 8/primitives
    0 !HISTORY 2016-12-31 [PTadmin] Official Update 2016-01


    1 16 0 0 0 6 0 0 0 1 0 0 0 6 8\\4-4edge.dat
    1 16 0 -4 0 6 0 0 0 1 0 0 0 6 8\\4-4edge.dat
    1 16 0 0 0 6 0 0 0 -4 0 0 0 6 8\\4-4cyli.dat
    1 16 0 -4 0 6 0 0 0 1 0 0 0 6 8\\4-4disc.dat`,

  "box4t.dat": `
    0 Box with 4 Adjacent Faces and All Edges
    0 Name: box4t.dat
    0 Author: Tore Eriksson [Tore_Eriksson]
    0 !LDRAW_ORG Primitive UPDATE 2003-02
    0 !LICENSE Licensed under CC BY 4.0 : see CAreadme.txt

    0 BFC CERTIFY CCW

    0 !HISTORY 1997-09-29 [PTadmin] Official Update 1997-15
    0 !HISTORY 2002-08-31 [izanette] Modified with WINDZ for BFC compliance
    0 !HISTORY 2003-08-01 [PTadmin] Official Update 2003-02
    0 !HISTORY 2007-06-24 [PTadmin] Header formatted for Contributor Agreement
    0 !HISTORY 2008-07-01 [PTadmin] Official Update 2008-01


    2 24 1 1 1 -1 1 1
    2 24 -1 1 1 -1 1 -1
    2 24 -1 1 -1 1 1 -1
    2 24 1 1 -1 1 1 1
    2 24 1 0 1 -1 0 1
    2 24 -1 0 1 -1 0 -1
    2 24 -1 0 -1 1 0 -1
    2 24 1 0 -1 1 0 1
    2 24 1 0 1 1 1 1
    2 24 -1 0 1 -1 1 1
    2 24 1 0 -1 1 1 -1
    2 24 -1 0 -1 -1 1 -1
    4 16 1 1 1 1 1 -1 -1 1 -1 -1 1 1
    4 16 1 1 1 -1 1 1 -1 0 1 1 0 1
    4 16 -1 1 1 -1 1 -1 -1 0 -1 -1 0 1
    0 // 4 16 -1 1 -1 -1 0 -1 1 0 -1 1 1 -1
    4 16 1 1 -1 1 1 1 1 0 1 1 0 -1
    0`,

  "box5.dat": `
    0 Box with 5 Faces and All Edges
    0 Name: box5.dat
    0 Author: James Jessiman
    0 !LDRAW_ORG Primitive UPDATE 2012-01
    0 !LICENSE Licensed under CC BY 4.0 : see CAreadme.txt

    0 BFC CERTIFY CCW

    0 !HISTORY 2002-04-03 [sbliss] Modified for BFC compliance
    0 !HISTORY 2002-04-25 [PTadmin] Official Update 2002-02
    0 !HISTORY 2007-06-24 [PTadmin] Header formatted for Contributor Agreement
    0 !HISTORY 2008-07-01 [PTadmin] Official Update 2008-01
    0 !HISTORY 2012-02-16 [Philo] Changed to CCW
    0 !HISTORY 2012-03-30 [PTadmin] Official Update 2012-01


    2 24 1 1 1 -1 1 1
    2 24 -1 1 1 -1 1 -1
    2 24 -1 1 -1 1 1 -1
    2 24 1 1 -1 1 1 1
    2 24 1 0 1 -1 0 1
    2 24 -1 0 1 -1 0 -1
    2 24 -1 0 -1 1 0 -1
    2 24 1 0 -1 1 0 1
    2 24 1 0 1 1 1 1
    2 24 -1 0 1 -1 1 1
    2 24 1 0 -1 1 1 -1
    2 24 -1 0 -1 -1 1 -1
    4 16 -1 1 1 1 1 1 1 1 -1 -1 1 -1
    4 16 -1 1 1 -1 0 1 1 0 1 1 1 1
    4 16 -1 1 -1 -1 0 -1 -1 0 1 -1 1 1
    4 16 1 1 -1 1 0 -1 -1 0 -1 -1 1 -1
    4 16 1 1 1 1 0 1 1 0 -1 1 1 -1`,
};
