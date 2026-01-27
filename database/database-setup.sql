IF (SCHEMA_ID('CallForDataSpeakers') IS NULL)
    EXEC('CREATE SCHEMA CallForDataSpeakers;');


GO
GRANT EXECUTE, SELECT ON SCHEMA::CallForDataSpeakers TO CallForDataSpeakers;


GO
IF (OBJECT_ID('CallForDataSpeakers.Campaigns') IS NULL)
    CREATE TABLE CallForDataSpeakers.Campaigns (
        Token           uniqueidentifier NOT NULL,
        [Name]          nvarchar(200) NOT NULL,
        EventName       nvarchar(400) NOT NULL,
        EventType       nvarchar(400) NULL,
        Email           nvarchar(400) NOT NULL,
        Regions         nvarchar(200) NOT NULL,
        Venue           nvarchar(1000) NOT NULL,
        [Date]          date NOT NULL,
        EndDate         date NULL,
        [URL]           nvarchar(1000) NOT NULL,
        Information     nvarchar(max) NULL,
        Created         datetime2(3) NOT NULL,
        [Sent]          datetime2(3) NULL,
        Cfs_Closes      datetime2(0) NULL,
        Lat             numeric(8, 5) NULL,
        Long numeric(8, 5) NULL,
        CONSTRAINT PK_Campaigns PRIMARY KEY NONCLUSTERED (Token),
        CONSTRAINT UQ_Campaigns UNIQUE CLUSTERED (EventName, Token)
    );

IF (OBJECT_ID('CallForDataSpeakers.Scraped_Events') IS NULL)
    CREATE TABLE CallForDataSpeakers.Scraped_Events (
        EventName       nvarchar(400) NOT NULL,
        Regions         nvarchar(200) NOT NULL,
        Venue           nvarchar(1000) NOT NULL,
        [Date]          date NOT NULL,
        EndDate         date NULL,
        [URL]           varchar(500) NOT NULL,
        Created         datetime2(3) NOT NULL,
        [Source]        varchar(100) NOT NULL,
        CONSTRAINT PK_Scraped_Events PRIMARY KEY NONCLUSTERED ([URL])
    );

GO
CREATE OR ALTER PROCEDURE CallForDataSpeakers.Insert_Campaign
    @Name           nvarchar(200),
    @Email          nvarchar(400),
    @EventName      nvarchar(400),
    @EventType      nvarchar(400)=NULL,
    @Regions        nvarchar(200),
    @Venue          nvarchar(1000),
    @Date           date,
    @EndDate        date=NULL,
    @URL            nvarchar(1000),
    @Information    nvarchar(max)
AS

INSERT INTO CallForDataSpeakers.Campaigns (Token, [Name], EventName, EventType, Email, Regions, Venue, [Date], EndDate, [URL], Information, Created)
OUTPUT inserted.Token
SELECT NEWID() AS Token, @Name, @EventName, @EventType, @Email, @Regions, @Venue, @Date, NULLIF(@EndDate, @Date), @URL, ISNULL(@Information, N''), SYSDATETIME() AS Created;

GO
CREATE OR ALTER PROCEDURE CallForDataSpeakers.Update_Campaign
    @Token          uniqueidentifier,
    @Name           nvarchar(200),
    @Email          nvarchar(400),
    @EventName      nvarchar(400),
    @EventType      nvarchar(400)=NULL,
    @Regions        nvarchar(200),
    @Venue          nvarchar(1000),
    @Date           date,
    @EndDate        date=NULL,
    @URL            nvarchar(1000),
    @Information    nvarchar(max)
AS

UPDATE CallForDataSpeakers.Campaigns
SET [Name]=@Name,
    EventName=@EventName,
    EventType=@EventType,
    Email=@Email,
    Regions=@Regions,
    Venue=@Venue,
    [Date]=@Date,
    EndDate=@EndDate,
    [URL]=@URL,
    Information=@Information
OUTPUT inserted.Token
WHERE Token=@Token;

GO
CREATE OR ALTER PROCEDURE CallForDataSpeakers.Approve_Campaign
    @Token          uniqueidentifier
AS

UPDATE CallForDataSpeakers.Campaigns
SET [Sent]=SYSDATETIME()
OUTPUT inserted.[Name], inserted.EventName, inserted.EventType, inserted.Email, inserted.Regions, inserted.Venue, inserted.[Date], inserted.EndDate, inserted.[URL], inserted.Information
WHERE Token=@Token
  AND [Sent] IS NULL;

GO
CREATE OR ALTER PROCEDURE CallForDataSpeakers.Update_CfsClose
    @Token          uniqueidentifier,
    @Cfs_Closes     datetime2(0),
    @Lat            numeric(8, 5)=NULL,
    @Long           numeric(8, 5)=NULL
AS

UPDATE CallForDataSpeakers.Campaigns
SET Cfs_Closes=@Cfs_Closes,
    Lat=ISNULL(Lat, @Lat),
    [Long]=ISNULL(@Long, [Long])
WHERE Token=@Token;

GO
CREATE OR ALTER PROCEDURE CallForDataSpeakers.Hide_Event
    @Token      uniqueidentifier
AS

UPDATE CallForDataSpeakers.Campaigns
SET [Sent]=NULL, Information='**Sessionize URL no longer valid**'
WHERE Token=@Token AND [Sent] IS NOT NULL;

GO
CREATE OR ALTER PROCEDURE CallForDataSpeakers.Update_LatLong
    @Token      uniqueidentifier,
    @Lat        numeric(8, 5),
    @Long       numeric(8, 5)
AS

UPDATE CallForDataSpeakers.Campaigns
SET Lat=@Lat, Long=@Long
WHERE Token=@Token;

GO
CREATE OR ALTER PROCEDURE CallForDataSpeakers.Set_Scraped_Event
    @EventName          nvarchar(400),
    @Regions            nvarchar(200),
    @Venue              nvarchar(1000),
    @Date               date,
    @EndDate            date,
    @URL                varchar(500),
    @Source             varchar(100)
AS

IF (NULLIF(TRIM(@URL), '') IS NULL)
    RETURN;

SET @URL=LEFT(@URL, CHARINDEX('?', @URL+'?')-1);
IF (RIGHT(@URL, 1)='/') SET @URL=LEFT(@URL, LEN(@URL)-1);

IF (EXISTS (SELECT NULL FROM CallForDataSpeakers.Campaigns WHERE [URL]=@URL)) BEGIN;
    DELETE FROM CallForDataSpeakers.Scraped_Events
    WHERE [URL]=@URL;

    RETURN;
END;

MERGE INTO CallForDataSpeakers.Scraped_Events AS dest
USING (SELECT @URL AS [URL]) AS x ON x.[URL]=dest.[URL]

WHEN NOT MATCHED BY TARGET THEN
    INSERT (EventName, Regions, Venue, [Date], EndDate, [URL], [Source], Created)
    VALUES (@EventName, @Regions, @Venue, @Date, @EndDate, @URL, @Source, SYSDATETIME())

WHEN MATCHED AND EXISTS (
        SELECT dest.EventName, dest.Regions, dest.Venue, dest.[Date], dest.EndDate
        EXCEPT
        SELECT @EventName, @Regions, @Venue, @Date, @EndDate) THEN
    UPDATE
    SET dest.EventName=@EventName,
        dest.Regions=@Regions,
        dest.Venue=@Venue,
        dest.[Date]=@Date,
        dest.EndDate=@EndDate,
        dest.[Source]=@Source;

GO
CREATE OR ALTER VIEW CallForDataSpeakers.Feed
AS

SELECT EventName, EventType, Regions, Email, Venue, [Date], NULLIF(EndDate, [Date]) AS EndDate, [URL], Information, Created, Cfs_Closes, Lat, Long, CAST(NULL AS varchar(100)) AS [Source]
FROM CallForDataSpeakers.Campaigns
WHERE ISNULL(EndDate, [Date])>DATEADD(day, -90, SYSDATETIME())
  AND [Sent] IS NOT NULL

UNION ALL

SELECT EventName, 'External' AS EventType, Regions, NULL AS Email, Venue, [Date], NULLIF(EndDate, [Date]) AS EndDate, [URL], NULL AS Information, NULL AS Created, NULL AS Cfs_Closes, NULL AS Lat, NULL AS Long, [Source]
FROM CallForDataSpeakers.Scraped_Events
WHERE REPLACE([URL], '/', '') NOT IN (SELECT CAST(REPLACE([URL], '/', '') AS varchar(500)) FROM CallForDataSpeakers.Campaigns WHERE [Sent] IS NOT NULL);

GO
